import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CLAUDE_TIERS, claudeCostUsd, type ClaudeTierId, type ClaudeTrace, type ScenarioId } from "@jev/shared";
import { queues, type Queue } from "./queue";
import { newTraceId } from "./trace";

export type Effort = "low" | "medium" | "high";

/**
 * How structured output is obtained. Bedrock runtime (InvokeModel) accepts `output_config.format`
 * for the Claude 4.6 family but rejects it for Sonnet 5 / Opus 5 (400 "Extra inputs are not
 * permitted"); strict tools are rejected there too, so those models end up on `tool-lax`: a forced
 * non-strict tool call whose input is validated client-side with zod. Fable 5.1 forbids forced
 * tool_choice, so it always uses `format`.
 */
export type StructuredMode = "format" | "tool" | "tool-lax";

export interface ClaudeCallBase {
  scenario: ScenarioId;
  /** Tag shown in the inspector, e.g. "generate_answer". */
  purpose: string;
  /** Defaults to "standard" (Claude Sonnet 5). */
  tier?: ClaudeTierId;
  system?: string;
  messages: Anthropic.MessageParam[];
  /** Default 2048; raise for long generations. */
  maxTokens?: number;
  effort?: Effort;
  /** Only valid on tiers with `supportsTemperature` (Claude 4.6 family). */
  temperature?: number;
}

export interface ClaudeParseCall<T> extends ClaudeCallBase {
  schema: z.ZodType<T>;
}

export class ClaudeRefusalError extends Error {
  constructor(
    readonly category: string | null,
    readonly explanation: string | null,
    /** The billed call that produced the refusal, so callers can still record its cost. */
    readonly trace?: ClaudeTrace,
  ) {
    super(`Claude refused the request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

export type StructuredFailure = "truncated" | "missing" | "invalid";

export class ClaudeStructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: unknown,
    /** truncated = hit max_tokens (re-asking cannot fix it; raise maxTokens); missing/invalid = re-ask with a correction. */
    readonly reason: StructuredFailure = "invalid",
    /** The billed call, so callers can record its cost even though it failed. */
    readonly trace?: ClaudeTrace,
    /** The assistant turn that failed, so a corrective retry can include it in the conversation. */
    readonly assistantContent?: Anthropic.ContentBlock[],
  ) {
    super(message);
    this.name = "ClaudeStructuredOutputError";
  }
}

export class ClaudeTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeTierError";
  }
}

type ParsedLike<T> = Anthropic.Message & { parsed_output: T | null };

/** The subset of the Bedrock client we use, so tests can inject a fake. */
export interface ClaudeClientLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
    parse(params: Anthropic.MessageCreateParamsNonStreaming): Promise<ParsedLike<unknown>>;
  };
}

const TOOL_NAME = "emit_structured_result";

/** Convert a zod schema to a tool input schema acceptable to strict tool use. */
export function toolInputSchema(schema: z.ZodType, strict: boolean): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return tighten(json, strict) as Record<string, unknown>;
}

function tighten(node: unknown, strict: boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => tighten(n, strict));
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  delete o.$schema;
  if (strict) for (const k of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) delete o[k];
  if (o.properties && typeof o.properties === "object") {
    const props = o.properties as Record<string, unknown>;
    o.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, tighten(v, strict)]));
    o.additionalProperties = false;
    o.required = Object.keys(props);
  }
  for (const k of ["items", "anyOf", "oneOf", "allOf"]) if (k in o) o[k] = tighten(o[k], strict);
  return o;
}

function envMode(): StructuredMode | "auto" {
  const v = process.env.STRUCTURED_OUTPUT_MODE;
  return v === "format" || v === "tool" || v === "tool-lax" ? v : "auto";
}

const isFormatRejected = (err: unknown) => err instanceof Anthropic.BadRequestError && /output_config/i.test(err.message);
const isStrictRejected = (err: unknown) => err instanceof Anthropic.BadRequestError && /strict/i.test(err.message);

export function createClaude(deps: { client: () => ClaudeClientLike; queue?: Queue }) {
  const queue = deps.queue ?? queues.claude;
  /** Remembered per model id so the fallback costs one failed request per process, not per call. */
  const modeByModel = new Map<string, StructuredMode>();

  function buildParams(call: ClaudeCallBase) {
    const tier = CLAUDE_TIERS[call.tier ?? "standard"];
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: tier.modelId,
      max_tokens: call.maxTokens ?? 2048,
      messages: call.messages,
    };
    if (call.system) params.system = call.system;
    if (call.effort) {
      if (!tier.supportsEffort) throw new ClaudeTierError(`${tier.label} 不支持 output_config.effort`);
      params.output_config = { effort: call.effort };
    }
    if (call.temperature !== undefined) {
      if (!tier.supportsTemperature) throw new ClaudeTierError(`${tier.label} 不支持 temperature 参数（Claude 5 系列已移除）`);
      params.temperature = call.temperature;
    }
    return { tier, params };
  }

  function toTrace(call: ClaudeCallBase, tierId: ClaudeTierId, msg: Anthropic.Message, startedAt: string, latencyMs: number): ClaudeTrace {
    return {
      kind: "claude",
      id: newTraceId(),
      scenario: call.scenario,
      purpose: call.purpose,
      startedAt,
      latencyMs,
      tier: tierId,
      model: msg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cost: { usd: claudeCostUsd(tierId, msg.usage.input_tokens, msg.usage.output_tokens) },
      stopReason: msg.stop_reason ?? null,
    };
  }

  function throwIfRefused(msg: Anthropic.Message, trace: ClaudeTrace): void {
    if (msg.stop_reason === "refusal") {
      const details = (msg as { stop_details?: { category?: string | null; explanation?: string | null } | null }).stop_details;
      throw new ClaudeRefusalError(details?.category ?? null, details?.explanation ?? null, trace);
    }
  }

  /** Run one request inside the queue and time only the request itself (not the queue wait). */
  async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; startedAt: string; latencyMs: number }> {
    return queue.run(async () => {
      const startedAt = new Date().toISOString();
      const t0 = performance.now();
      const value = await fn();
      return { value, startedAt, latencyMs: Math.round(performance.now() - t0) };
    });
  }

  async function claudeText(call: ClaudeCallBase): Promise<{ text: string; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const { value: msg, startedAt, latencyMs } = await timed(() => deps.client().messages.create(params));
    const trace = toTrace(call, tier.id, msg, startedAt, latencyMs);
    throwIfRefused(msg, trace);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, trace };
  }

  async function viaFormat<T>(call: ClaudeParseCall<T>, tierId: ClaudeTierId, params: Anthropic.MessageCreateParamsNonStreaming) {
    const withFormat: Anthropic.MessageCreateParamsNonStreaming = {
      ...params,
      output_config: { ...(params.output_config ?? {}), format: zodOutputFormat(call.schema) },
    };
    const { value, startedAt, latencyMs } = await timed(() => deps.client().messages.parse(withFormat));
    const msg = value as ParsedLike<T>;
    const trace = toTrace(call, tierId, msg, startedAt, latencyMs);
    throwIfRefused(msg, trace);
    if (msg.stop_reason === "max_tokens") {
      throw new ClaudeStructuredOutputError("输出被 max_tokens 截断，请提高 maxTokens 或减少问题数量", msg.content, "truncated", trace, msg.content);
    }
    if (msg.parsed_output === null || msg.parsed_output === undefined) {
      throw new ClaudeStructuredOutputError("结构化输出解析失败（parsed_output 为空）", msg.content, "missing", trace, msg.content);
    }
    return { msg, parsed: msg.parsed_output, trace };
  }

  async function viaTool<T>(call: ClaudeParseCall<T>, tierId: ClaudeTierId, params: Anthropic.MessageCreateParamsNonStreaming, strict: boolean) {
    const tool = {
      name: TOOL_NAME,
      description: "Return the result in the required structure. Call this tool exactly once.",
      input_schema: toolInputSchema(call.schema, strict) as Anthropic.Tool["input_schema"],
      ...(strict ? { strict: true } : {}),
    } as Anthropic.Tool;
    const withTool: Anthropic.MessageCreateParamsNonStreaming = {
      ...params,
      tools: [tool],
      tool_choice: { type: "tool", name: TOOL_NAME },
    };
    const { value: msg, startedAt, latencyMs } = await timed(() => deps.client().messages.create(withTool));
    const trace = toTrace(call, tierId, msg, startedAt, latencyMs);
    throwIfRefused(msg, trace);
    if (msg.stop_reason === "max_tokens") {
      throw new ClaudeStructuredOutputError("输出被 max_tokens 截断，请提高 maxTokens 或减少问题数量", msg.content, "truncated", trace, msg.content);
    }
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new ClaudeStructuredOutputError("模型没有返回工具调用", msg.content, "missing", trace, msg.content);
    const checked = call.schema.safeParse(block.input);
    if (!checked.success) throw new ClaudeStructuredOutputError(`工具输入不符合 schema：${checked.error.message}`, block.input, "invalid", trace, msg.content);
    return { msg, parsed: checked.data, trace };
  }

  async function claudeParse<T>(call: ClaudeParseCall<T>): Promise<{ parsed: T; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const forced = envMode();
    let mode: StructuredMode = forced === "auto" ? (modeByModel.get(tier.modelId) ?? "format") : forced;
    if (tier.id === "frontier") mode = "format"; // Fable 5.1 rejects forced tool_choice
    for (;;) {
      try {
        const { parsed, trace } = mode === "format" ? await viaFormat(call, tier.id, params) : await viaTool(call, tier.id, params, mode === "tool");
        modeByModel.set(tier.modelId, mode);
        // latencyMs covers the successful attempt only; a failed probe attempt is remembered per model so it happens once.
        trace.structuredMode = mode;
        return { parsed, trace };
      } catch (err) {
        if (mode === "format" && tier.id !== "frontier" && isFormatRejected(err)) {
          mode = "tool";
          continue;
        }
        if (mode === "tool" && isStrictRejected(err)) {
          mode = "tool-lax";
          continue;
        }
        throw err;
      }
    }
  }

  return { claudeText, claudeParse };
}

let singleton: AnthropicBedrock | undefined;
/** Bedrock runtime (InvokeModel) client; credentials from the default AWS chain (AWS_PROFILE). */
export function defaultClaudeClient(): ClaudeClientLike {
  singleton ??= new AnthropicBedrock({ awsRegion: process.env.AWS_REGION ?? "us-east-1" });
  return singleton as unknown as ClaudeClientLike;
}

const defaultClaude = createClaude({ client: defaultClaudeClient });
export const claudeText = defaultClaude.claudeText;
export const claudeParse = defaultClaude.claudeParse;
