import {
  B4_THRESHOLDS, EXAMPLE_REQUESTS, ROOMS, buildB4Questions, buildRequestState, claudeCostUsd, dispatch,
  type Answers, type Command, type Dispatch, type HomeState, type JevTrace, type Trace,
} from "@jev/shared";
import { Hono } from "hono";
import { z } from "zod";
import { claudeParse as defaultClaudeParse, claudeText as defaultClaudeText } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

const MAX_REQUEST_CHARS = 300;
const QUESTIONS = buildB4Questions(ROOMS);

export const SPLIT_SYSTEM =
  "Split the smart-home request into independent single-action requests, one per array item. " +
  "Keep the room name inside every part it applies to, drop greetings and filler, and never add actions the user did not ask for.";
export const CHAT_SYSTEM = "You are a friendly smart-home assistant. Reply in one short sentence (at most 25 words). Do not offer to do anything the user did not ask.";
export const STATE_SYSTEM =
  "You are a smart-home assistant. Answer the question from HOME_STATE only, in one sentence. Room ids: living_room, kitchen, bedroom, bathroom, office. If the answer is not in HOME_STATE, say so.";

const SplitSchema = z.object({ parts: z.array(z.string().min(1)).min(1).max(5) });

interface CommandBody {
  request?: unknown;
  home?: unknown;
  confirmed?: unknown;
}

export type B4Decision = Exclude<Dispatch, { kind: "split" }> | { kind: "split"; parts: { text: string; decision: Dispatch }[]; trace: Dispatch["trace"] };

const isHome = (h: unknown): h is HomeState =>
  typeof h === "object" && h !== null && "rooms" in h && "front_door_lock" in h && ROOMS.every((r) => typeof (h as { rooms: Record<string, unknown> }).rooms[r] === "object");

/**
 * One Jev request with fourteen speculative questions; the pure dispatcher decides. Claude only splits
 * compound requests (then each part goes back to Jev — a new state, the documented exception) and
 * answers chit-chat / state questions.
 */
export function createB4Routes(deps: { askJev: typeof defaultAskJev; claudeText: typeof defaultClaudeText; claudeParse: typeof defaultClaudeParse }) {
  const app = new Hono();
  app.onError(apiErrorHandler);
  const replyCache = new Map<string, { text: string; trace: Trace }>();

  async function judge(request: string, home: HomeState, cache: "read-write" | "read-only"): Promise<{ decision: Dispatch; trace: JevTrace }> {
    const { result, trace } = await deps.askJev({ scenario: "b4", state: buildRequestState(request, home), questions: QUESTIONS }, { cache });
    usage.record(trace);
    return { decision: dispatch(result.answers as unknown as Answers, request, B4_THRESHOLDS), trace };
  }

  app.post("/command", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as CommandBody;
    const request = typeof body.request === "string" ? body.request.trim() : "";
    if (!request) throw new BadRequestError("请输入指令");
    if (request.length > MAX_REQUEST_CHARS) throw new BadRequestError(`指令不能超过 ${MAX_REQUEST_CHARS} 个字符`, { length: request.length });
    if (!isHome(body.home)) throw new BadRequestError("缺少房屋状态 home");
    const home = body.home;
    const confirmed = body.confirmed === true;
    const cache = EXAMPLE_REQUESTS.some((e) => e.text === request) ? "read-write" : "read-only";

    const traces: Trace[] = [];
    const commands: Command[] = [];
    let reply: string | undefined;
    let clarification: string | undefined;

    const first = await judge(request, home, cache);
    traces.push(first.trace);
    let decision: B4Decision = first.decision.kind === "split" ? { kind: "split", parts: [], trace: first.decision.trace } : first.decision;

    const collect = (d: Dispatch) => {
      if (d.kind === "commands") commands.push(...d.commands);
      else if (d.kind === "confirm_lock" && confirmed) commands.push(d.command);
      else if (d.kind === "clarify") clarification = clarification ? `${clarification}；${d.question_zh}` : d.question_zh;
    };

    if (first.decision.kind === "split") {
      const { parsed, trace } = await deps.claudeParse({
        scenario: "b4", purpose: "split_compound", tier: "standard", system: SPLIT_SYSTEM,
        messages: [{ role: "user", content: request }], maxTokens: 300, effort: "low", schema: SplitSchema,
      });
      usage.record(trace);
      traces.push(trace);
      const parts = await Promise.all(parsed.parts.map(async (text) => {
        const r = await judge(text, home, cache);
        traces.push(r.trace);
        return { text, decision: r.decision };
      }));
      parts.forEach((p) => collect(p.decision));
      decision = { kind: "split", parts, trace: first.decision.trace };
    } else if (first.decision.kind === "chat" || first.decision.kind === "state_question") {
      const isState = first.decision.kind === "state_question";
      const key = `${first.decision.kind}::${request}::${isState ? JSON.stringify(home) : ""}`;
      let cached = replyCache.get(key);
      if (!cached) {
        const { text, trace } = await deps.claudeText({
          scenario: "b4", purpose: first.decision.kind, tier: "standard", system: isState ? STATE_SYSTEM : CHAT_SYSTEM,
          messages: [{ role: "user", content: isState ? `HOME_STATE:\n${JSON.stringify(home)}\n\nQUESTION: ${request}` : request }],
          maxTokens: 120, effort: "low",
        });
        usage.record(trace);
        cached = { text, trace };
        replyCache.set(key, cached);
        traces.push(trace);
      }
      reply = cached.text;
    } else {
      collect(first.decision);
      if (first.decision.kind === "confirm_lock" && confirmed) decision = { kind: "commands", commands: [first.decision.command], trace: first.decision.trace };
    }

    const jevTokens = traces.filter((t): t is JevTrace => t.kind === "jev").reduce((s, t) => s + t.response.usage.input_tokens, 0);
    return c.json({
      request,
      decision,
      commands,
      reply,
      clarification,
      traces,
      baseline: { functionCallingUsd: claudeCostUsd("standard", jevTokens, 120) },
    });
  });

  return app;
}

export const b4Routes = createB4Routes({ askJev: defaultAskJev, claudeText: defaultClaudeText, claudeParse: defaultClaudeParse });
