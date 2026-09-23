import type { Answers, JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createA4Routes } from "./a4";

const answers: Answers = {
  department: { type: "choice", choice: "orders", probabilities: { billing: 0.45, orders: 0.55, account: 0, technical: 0, other: 0 }, confidence: 0.4 },
  requested_resolution: { type: "choice", choice: "refund", probabilities: { refund: 0.6, exchange: 0.4 }, confidence: 0.3 },
  bug_severity: { type: "score", score: 0, probabilities: { "0": 1, "1": 0, "2": 0 }, legend: { "0": "a", "1": "b", "2": "c" }, confidence: 1 },
  refund_requested: { type: "noul", noul: 0.4 },
  mentions_open_order: { type: "noul", noul: 0.8 },
  frustration: { type: "score", score: 1.5, probabilities: { "0": 0, "1": 0.5, "2": 0.5 }, legend: { "0": "a", "1": "b", "2": "c" }, confidence: 0.5 },
};

function build() {
  let n = 0;
  const askJev = vi.fn(async (input: { state: unknown }, _opts: unknown) => {
    n += 1;
    const trace: JevTrace = {
      kind: "jev", id: `j${n}`, scenario: "a4", startedAt: "", latencyMs: 100, cached: false, model: "jev-1.13.0",
      request: { state: input.state as never, questions: {}, model: "jev-latest" },
      response: { answers, usage: { input_tokens: 1200, output_tokens: 30 } }, cost: { usd: 0.00005 },
    };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  const askLlmSystemOne = vi.fn(async (_input: unknown) => ({
    answers,
    trace: { kind: "claude" as const, id: `c${++n}`, scenario: "a4" as const, purpose: "llmSystemOne", startedAt: "", latencyMs: 900, tier: "standard" as const, model: "m", inputTokens: 1400, outputTokens: 300, cost: { usd: 0.0058 }, stopReason: "end_turn" },
    debug: { normalizationDelta: { department: 0.02 }, degenerate: [], retried: false },
  }));
  return { app: createA4Routes({ askJev: askJev as never, askLlmSystemOne: askLlmSystemOne as never, resultsDir: null }), askJev, askLlmSystemOne };
}

function parseSse(text: string): { event: string; data: Record<string, unknown> }[] {
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.+)$/m.exec(block)?.[1] ?? "{}";
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

describe("GET /api/a4/run (SSE)", () => {
  it("streams start, one run event per arm per run, then done", async () => {
    const { app, askJev, askLlmSystemOne } = build();
    const res = await app.request("/run?caseId=ticket&runs=3&arms=jev,sonnet5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const events = parseSse(await res.text());
    expect(events[0]?.event).toBe("start");
    expect(events[0]?.data).toMatchObject({ caseId: "ticket", runs: 3, arms: ["jev", "sonnet5"] });
    const runs = events.filter((e) => e.event === "run");
    expect(runs).toHaveLength(6);
    expect(runs.filter((r) => r.data.arm === "jev")).toHaveLength(3);
    expect(runs.find((r) => r.data.arm === "sonnet5")?.data).toMatchObject({ latencyMs: 900, costUsd: 0.0058, normalizationDelta: { department: 0.02 } });
    expect(events.at(-1)?.event).toBe("done");
    expect(askJev).toHaveBeenCalledTimes(3);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
    expect(askLlmSystemOne).toHaveBeenCalledTimes(3);
    const llmCall = askLlmSystemOne.mock.calls[0]?.[0] as { tier: string; temperature?: number };
    expect(llmCall.tier).toBe("standard");
    expect(llmCall.temperature).toBeUndefined();
  });

  it("passes temperature 0 for the Sonnet 4.6 t0 arm and clamps runs", async () => {
    const { app, askLlmSystemOne } = build();
    const res = await app.request("/run?caseId=moderation&runs=99&arms=sonnet46_t0");
    const events = parseSse(await res.text());
    expect(events[0]?.data.runs).toBe(15);
    const call = askLlmSystemOne.mock.calls[0]?.[0] as { tier: string; temperature?: number };
    expect(call.tier).toBe("prev_sonnet");
    expect(call.temperature).toBe(0);
  });

  it("adds a uid nonce to the state when requested", async () => {
    const { app, askJev } = build();
    await (await app.request("/run?caseId=ticket&runs=3&arms=jev&nonce=1")).text();
    const state = askJev.mock.calls[0]?.[0] as { state: { uid?: string } };
    expect(state.state.uid).toMatch(/^ticket:1:/);
  });

  it("rejects unknown cases and arms with 400 before streaming", async () => {
    const { app } = build();
    expect((await app.request("/run?caseId=nope&runs=3&arms=jev")).status).toBe(400);
    expect((await app.request("/run?caseId=ticket&runs=3&arms=gpt")).status).toBe(400);
  });

  it("keeps streaming other arms when one arm fails", async () => {
    const { app, askLlmSystemOne } = build();
    askLlmSystemOne.mockRejectedValue(new Error("Bedrock down"));
    const events = parseSse(await (await app.request("/run?caseId=ticket&runs=3&arms=jev,sonnet5")).text());
    expect(events.filter((e) => e.event === "run")).toHaveLength(3);
    expect(events.filter((e) => e.event === "arm_error")).toHaveLength(3);
    expect(events.at(-1)?.event).toBe("done");
  });
});
