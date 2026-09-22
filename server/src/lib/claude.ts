import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { CLAUDE_TIERS, claudeCostUsd, type ClaudeTierId, type ClaudeTrace, type ScenarioId } from "@jev/shared";
import { queues, type Queue } from "./queue";
import { newTraceId } from "./trace";

export type Effort = "low" | "medium" | "high";

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
  ) {
    super(`Claude refused the request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

export class ClaudeStructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: unknown,
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

export function createClaude(deps: { client: () => ClaudeClientLike; queue?: Queue }) {
  const queue = deps.queue ?? queues.claude;

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

  function throwIfRefused(msg: Anthropic.Message): void {
    if (msg.stop_reason === "refusal") {
      const details = (msg as { stop_details?: { category?: string | null; explanation?: string | null } | null }).stop_details;
      throw new ClaudeRefusalError(details?.category ?? null, details?.explanation ?? null);
    }
  }

  async function claudeText(call: ClaudeCallBase): Promise<{ text: string; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const msg = await queue.run(() => deps.client().messages.create(params));
    const trace = toTrace(call, tier.id, msg, startedAt, Math.round(performance.now() - t0));
    throwIfRefused(msg);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, trace };
  }

  async function claudeParse<T>(call: ClaudeParseCall<T>): Promise<{ parsed: T; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const withFormat: Anthropic.MessageCreateParamsNonStreaming = {
      ...params,
      output_config: { ...(params.output_config ?? {}), format: zodOutputFormat(call.schema) },
    };
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const msg = (await queue.run(() => deps.client().messages.parse(withFormat))) as ParsedLike<T>;
    const trace = toTrace(call, tier.id, msg, startedAt, Math.round(performance.now() - t0));
    throwIfRefused(msg);
    if (msg.stop_reason === "max_tokens") {
      throw new ClaudeStructuredOutputError("输出被 max_tokens 截断，请提高 maxTokens 或减少问题数量", msg.content);
    }
    if (msg.parsed_output === null || msg.parsed_output === undefined) {
      throw new ClaudeStructuredOutputError("结构化输出解析失败（parsed_output 为空）", msg.content);
    }
    return { parsed: msg.parsed_output, trace };
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
