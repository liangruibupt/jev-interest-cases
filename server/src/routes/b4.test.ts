import type { Answers, ClaudeTrace, JevTrace } from "@jev/shared";
import { INITIAL_HOME } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createB4Routes } from "./b4";

function answersFor(request: string): Answers {
  const base: Record<string, { choice: string; confidence?: number } | number> = {
    category: { choice: "device_command", confidence: 0.95 }, is_compound: 0.05, room: { choice: "kitchen", confidence: 0.9 }, device: { choice: "lights", confidence: 0.9 },
    light_action: { choice: "turn_off", confidence: 0.9 }, brightness_level: { choice: "not_stated" }, color: { choice: "not_stated" }, thermostat_action: { choice: "not_applicable" },
    blinds_action: { choice: "not_applicable" }, speaker_action: { choice: "not_applicable" }, tv_action: { choice: "not_applicable" }, lock_action: { choice: "not_applicable" },
    mentions_number: 0.05, is_question_about_state: 0.05,
  };
  const over: Record<string, { choice: string; confidence?: number } | number> = {};
  if (request.includes(" and ")) over.is_compound = 0.9;
  if (request.startsWith("close the bedroom blinds")) Object.assign(over, { room: { choice: "bedroom" }, device: { choice: "blinds" }, blinds_action: { choice: "close" } });
  if (request.startsWith("unlock")) Object.assign(over, { device: { choice: "front_door_lock" }, room: { choice: "not_stated" }, lock_action: { choice: "unlock", confidence: 0.97 } });
  if (request.startsWith("hi")) over.category = { choice: "chit_chat", confidence: 0.98 };
  if (request.startsWith("is the")) over.category = { choice: "information_question", confidence: 0.96 };
  const merged = { ...base, ...over };
  const out: Answers = {};
  for (const [id, v] of Object.entries(merged)) {
    if (typeof v === "number") out[id] = { type: "noul", noul: v };
    else out[id] = { type: "choice", choice: v.choice, probabilities: { [v.choice]: 1 }, confidence: v.confidence ?? 0.9 };
  }
  return out;
}

function build() {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { request: string } }, _opts: unknown) => {
    n += 1;
    const answers = answersFor(input.state.request);
    const trace: JevTrace = {
      kind: "jev", id: `j${n}`, scenario: "b4", startedAt: "", latencyMs: 120, cached: false, model: "jev-1.13.0",
      request: { state: input.state as never, questions: {}, model: "jev-latest" },
      response: { answers, usage: { input_tokens: 1000, output_tokens: 14 } }, cost: { usd: 0.000042 },
    };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  const ctrace = (purpose: string): ClaudeTrace => ({ kind: "claude", id: `c-${purpose}`, scenario: "b4", purpose, startedAt: "", latencyMs: 1500, model: "m", tier: "standard", inputTokens: 300, outputTokens: 40, stopReason: "end_turn", cost: { usd: 0.001 } });
  const claudeText = vi.fn(async (call: { purpose: string }) => ({ text: `reply:${call.purpose}`, trace: ctrace(call.purpose) }));
  const claudeParse = vi.fn(async (call: { purpose: string }) => ({ parsed: { parts: ["turn off the kitchen lights", "close the bedroom blinds"] }, trace: ctrace(call.purpose) }));
  return { app: createB4Routes({ askJev: askJev as never, claudeText: claudeText as never, claudeParse: claudeParse as never }), askJev, claudeText, claudeParse };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/b4/command", () => {
  it("single command: one Jev request, no Claude, commands returned; example text uses read-write cache", async () => {
    const { app, askJev, claudeText, claudeParse } = build();
    const res = await post(app, { request: "turn off all the lights", home: INITIAL_HOME });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decision: { kind: string }; commands: unknown[]; traces: unknown[]; baseline: { functionCallingUsd: number } };
    expect(body.decision.kind).toBe("commands");
    expect(body.commands).toEqual([{ type: "lights", room: "kitchen", on: false }]);
    expect(askJev).toHaveBeenCalledTimes(1);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    expect(claudeText).not.toHaveBeenCalled();
    expect(claudeParse).not.toHaveBeenCalled();
    expect(body.traces).toHaveLength(1);
    expect(body.baseline.functionCallingUsd).toBeGreaterThan(0);
  });

  it("compound: Claude splits, each part goes back to Jev, commands are concatenated", async () => {
    const { app, askJev, claudeParse } = build();
    const res = await post(app, { request: "turn off the kitchen lights and close the bedroom blinds", home: INITIAL_HOME });
    const body = (await res.json()) as { decision: { kind: string; parts?: { text: string; decision: { kind: string } }[] }; commands: unknown[]; traces: unknown[] };
    expect(body.decision.kind).toBe("split");
    expect(body.decision.parts?.map((p) => p.decision.kind)).toEqual(["commands", "commands"]);
    expect(body.commands).toEqual([{ type: "lights", room: "kitchen", on: false }, { type: "blinds", room: "bedroom", open: false }]);
    expect(claudeParse).toHaveBeenCalledTimes(1);
    expect(askJev).toHaveBeenCalledTimes(3);
    expect(body.traces).toHaveLength(4);
  });

  it("unlock needs confirmation; confirmed → command. chit-chat and state questions go to claudeText only", async () => {
    const { app, askJev, claudeText } = build();
    const first = (await (await post(app, { request: "unlock the front door", home: INITIAL_HOME })).json()) as { decision: { kind: string }; commands: unknown[] };
    expect(first.decision.kind).toBe("confirm_lock");
    expect(first.commands).toEqual([]);
    const second = (await (await post(app, { request: "unlock the front door", home: INITIAL_HOME, confirmed: true })).json()) as { decision: { kind: string }; commands: unknown[] };
    expect(second.decision.kind).toBe("commands");
    expect(second.commands).toEqual([{ type: "lock", locked: false }]);

    const chat = (await (await post(app, { request: "hi there", home: INITIAL_HOME })).json()) as { decision: { kind: string }; reply?: string };
    expect(chat.decision.kind).toBe("chat");
    expect(chat.reply).toBe("reply:chat");
    const state = (await (await post(app, { request: "is the front door locked?", home: INITIAL_HOME })).json()) as { decision: { kind: string }; reply?: string };
    expect(state.decision.kind).toBe("state_question");
    expect(state.reply).toBe("reply:state_question");
    expect(claudeText).toHaveBeenCalledTimes(2);
    const stateCall = claudeText.mock.calls[1]?.[0] as unknown as { messages: { content: string }[] };
    expect(stateCall.messages[0]?.content).toContain("front_door_lock");
    expect(askJev.mock.calls.every((c) => (c[1] as { cache: string }).cache === "read-write")).toBe(true);
  });

  it("free text is read-only; bad input → 400", async () => {
    const { app, askJev } = build();
    await post(app, { request: "please switch the kitchen lights off", home: INITIAL_HOME });
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-only" });
    expect((await post(app, { request: "", home: INITIAL_HOME })).status).toBe(400);
    expect((await post(app, { request: "x".repeat(301), home: INITIAL_HOME })).status).toBe(400);
    expect((await post(app, { request: "hi", home: null })).status).toBe(400);
    expect((await post(app, null)).status).toBe(400);
  });
});
