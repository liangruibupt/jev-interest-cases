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

export type B4Part = { text: string; decision: Dispatch; error?: undefined } | { text: string; decision?: undefined; error: string };
export type B4Decision = Exclude<Dispatch, { kind: "split" }> | { kind: "split"; parts: B4Part[]; trace: Dispatch["trace"] };

const MAX_HOME_CHARS = 20_000;
const isHome = (h: unknown): h is HomeState => {
  if (typeof h !== "object" || h === null) return false;
  const rooms = (h as { rooms?: unknown }).rooms;
  const lock = (h as { front_door_lock?: unknown }).front_door_lock;
  if (typeof rooms !== "object" || rooms === null || typeof lock !== "object" || lock === null) return false;
  return ROOMS.every((r) => typeof (rooms as Record<string, unknown>)[r] === "object" && (rooms as Record<string, unknown>)[r] !== null);
};

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
    if (!isHome(body.home)) throw new BadRequestError("缺少或无效的房屋状态 home");
    if (JSON.stringify(body.home).length > MAX_HOME_CHARS) throw new BadRequestError("房屋状态过大");
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

    const addClarification = (q: string) => {
      clarification = clarification ? `${clarification}；${q}` : q;
    };
    /** Parts of a split never apply a lock (no dialog ever described that command) and never trigger Claude again. */
    const collectPart = (text: string, d: Dispatch) => {
      if (d.kind === "commands") commands.push(...d.commands);
      else if (d.kind === "confirm_lock") addClarification(`"${text}"：开锁 / 上锁请单独发送并确认`);
      else if (d.kind === "clarify") addClarification(`"${text}"：${d.question_zh}`);
      else addClarification(`"${text}"：请单独发送`);
    };

    if (first.decision.kind === "split") {
      const { parsed, trace } = await deps.claudeParse({
        scenario: "b4", purpose: "split_compound", tier: "standard", system: SPLIT_SYSTEM,
        messages: [{ role: "user", content: request }], maxTokens: 300, effort: "low", schema: SplitSchema,
      });
      usage.record(trace);
      traces.push(trace);
      const settled = await Promise.allSettled(parsed.parts.map((text) => judge(text, home, cache)));
      const parts = settled.map((s, i) => {
        const text = parsed.parts[i]!;
        if (s.status === "fulfilled") {
          traces.push(s.value.trace);
          collectPart(text, s.value.decision);
          return { text, decision: s.value.decision };
        }
        const error = s.reason instanceof Error ? s.reason.message : String(s.reason);
        addClarification(`"${text}"：Jev 调用失败，请重试`);
        return { text, error };
      });
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
    } else if (first.decision.kind === "commands") {
      commands.push(...first.decision.commands);
    } else if (first.decision.kind === "confirm_lock") {
      // The client re-sends the same request with confirmed: true after the user approves the dialog.
      if (confirmed) {
        commands.push(first.decision.command);
        decision = { kind: "commands", commands: [first.decision.command], trace: first.decision.trace };
      }
    } else if (first.decision.kind === "clarify") {
      addClarification(first.decision.question_zh);
    }

    // An LLM doing function calling would read the request once; only the first Jev call is the like-for-like baseline.
    const jevTokens = first.trace.response.usage.input_tokens;
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
