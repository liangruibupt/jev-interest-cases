import type { Answers, ClaudeTrace, JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createC1Routes } from "./c1";

function gradeAnswers(text: string): Answers {
  const full = /Rayleigh|Raleigh/.test(text);
  return {
    cause_scattering: { type: "noul", noul: 0.95 },
    sunset_path: { type: "noul", noul: 0.9 },
    names_rayleigh: { type: "noul", noul: full ? 0.97 : 0.05 },
    evidence_or_example: { type: "noul", noul: 0.9 },
    on_topic: { type: "noul", noul: 0.98 },
    misconception: { type: "choice", choice: "none", probabilities: { none: 1 }, confidence: 0.95 },
    overall: { type: "score", score: full ? 3 : 2, probabilities: { "0": 0, "1": 0, "2": full ? 0 : 1, "3": full ? 1 : 0 }, legend: { "0": "a", "1": "b", "2": "c", "3": "d" }, confidence: 0.9 },
    clarity: { type: "score", score: 2, probabilities: { "0": 0, "1": 0, "2": 1 }, legend: { "0": "a", "1": "b", "2": "c" }, confidence: 0.9 },
  };
}
const verifyAnswers: Answers = { feedback_consistent: { type: "noul", noul: 0.93 }, feedback_specific: { type: "noul", noul: 0.88 }, feedback_kind: { type: "noul", noul: 0.97 } };

function build() {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { answer?: string; feedback?: string } }, _opts: unknown) => {
    n += 1;
    const answers = input.state.feedback !== undefined ? verifyAnswers : gradeAnswers(input.state.answer ?? "");
    const trace: JevTrace = { kind: "jev", id: `j${n}`, scenario: "c1", startedAt: "", latencyMs: 400, cached: false, model: "jev-1.13.0", request: { state: input.state as never, questions: {}, model: "jev-latest" }, response: { answers, usage: { input_tokens: 600, output_tokens: 8 } }, cost: { usd: 0.0000252 } };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  const claudeText = vi.fn(async (call: { purpose: string; messages: { content: string }[] }) => {
    const trace: ClaudeTrace = { kind: "claude", id: "c1", scenario: "c1", purpose: call.purpose, startedAt: "", latencyMs: 2500, model: "m", tier: "standard", inputTokens: 500, outputTokens: 70, stopReason: "end_turn", cost: { usd: 0.0017 } };
    return { text: "Great explanation of scattering! Next time, name the process (Rayleigh scattering).", trace };
  });
  return { app: createC1Routes({ askJev: askJev as never, claudeText: claudeText as never }), askJev, claudeText };
}
const post = (app: ReturnType<typeof build>["app"], path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("C1 routes", () => {
  it("grades all 12 essays with one Jev request each (read-write), live bypasses the cache, unknown id → 400", async () => {
    const { app, askJev } = build();
    const res = await post(app, "/grade", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Record<string, { answers: Answers }>; traces: unknown[] };
    expect(Object.keys(body.results)).toHaveLength(12);
    expect(askJev).toHaveBeenCalledTimes(12);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    expect(body.results.E01?.answers.names_rayleigh).toMatchObject({ type: "noul", noul: 0.97 });
    await post(app, "/grade", { essayIds: ["E02"], live: true });
    expect(askJev.mock.calls[12]?.[1]).toEqual({ cache: "off" });
    expect((await post(app, "/grade", { essayIds: ["E99"] })).status).toBe(400);
    expect((await post(app, "/grade", null)).status).toBe(200);
  });

  it("feedback: Jev grade → Claude writes → Jev verifies (read-only); second call is served from cache", async () => {
    const { app, askJev, claudeText } = build();
    const first = await post(app, "/feedback", { essayId: "E02" });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { feedback: string; grade: { points: number; criteria: { id: string; status: string }[] }; verification: { consistent: number; specific: number; kind: number }; traces: unknown[]; cached: boolean };
    expect(body.feedback).toMatch(/Rayleigh/);
    expect(body.grade.points).toBe(3);
    expect(body.grade.criteria.find((c) => c.id === "names_rayleigh")?.status).toBe("missed");
    expect(body.verification).toEqual({ consistent: 0.93, specific: 0.88, kind: 0.97 });
    expect(body.traces).toHaveLength(3);
    expect(body.cached).toBe(false);
    expect(askJev).toHaveBeenCalledTimes(2);
    expect(askJev.mock.calls[1]?.[1]).toEqual({ cache: "read-only" });
    const prompt = (claudeText.mock.calls[0]?.[0] as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain('"names_rayleigh":"missed"');

    const second = (await (await post(app, "/feedback", { essayId: "E02" })).json()) as { cached: boolean; traces: unknown[] };
    expect(second.cached).toBe(true);
    expect(second.traces).toHaveLength(0);
    expect(claudeText).toHaveBeenCalledTimes(1);
    expect((await post(app, "/feedback", { essayId: "nope" })).status).toBe(400);
  });
});
