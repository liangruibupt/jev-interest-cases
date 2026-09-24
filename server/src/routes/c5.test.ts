import { C5_PRESETS, type Answers, type JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createC5Routes } from "./c5";

function build(malformed = false) {
  const answers: Answers = {
    timbre: { type: "choice", choice: "warm", confidence: 1, probabilities: { warm: 1, glass: 0, pluck: 0 } },
    percussion: { type: "noul", noul: 0.03 }, silence: { type: "noul", noul: 0 },
  };
  if (!malformed) for (const id of ["energy", "brightness", "density", "tension"]) {
    answers[id] = { type: "score", score: 1, confidence: 1, probabilities: { "1": 1 }, legend: { "1": "level" } };
  }
  const askJev = vi.fn(async (input: { state: unknown; questions: unknown }, _opts: unknown) => {
    const trace: JevTrace = {
      kind: "jev", scenario: "c5", id: "c5-test", startedAt: "", cached: false, latencyMs: 100, model: "jev-test",
      request: { state: input.state as never, questions: input.questions as never, model: "jev-latest" },
      response: { answers, usage: { input_tokens: 100, output_tokens: 20 } }, cost: { usd: 0.0000042 },
    };
    return { result: { answers, model: trace.model, usage: trace.response.usage }, trace };
  });
  return { app: createC5Routes({ askJev: askJev as never }), askJev };
}
const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
describe("C5 interpret endpoint", () => {
  it("batches seven questions into one request and caches public presets", async () => {
    const { app, askJev } = build();
    const res = await post(app, { brief: C5_PRESETS[0].brief });
    expect(res.status).toBe(200);
    const body = await res.json() as { mix: { timbre: string }; traces: unknown[] };
    expect(body.mix.timbre).toBe("warm");
    expect(body.traces).toHaveLength(1);
    expect(askJev).toHaveBeenCalledTimes(1);
    expect(Object.keys(askJev.mock.calls[0]![0].questions as object)).toHaveLength(7);
    expect(askJev.mock.calls[0]![1]).toEqual({ cache: "read-write" });
  });
  it("never writes custom input into the committed cache; live bypasses it", async () => {
    const { app, askJev } = build();
    await post(app, { brief: "An original sound for my private scene." });
    expect(askJev.mock.calls[0]![1]).toEqual({ cache: "read-only" });
    await post(app, { brief: C5_PRESETS[0].brief, live: true });
    expect(askJev.mock.calls[1]![1]).toEqual({ cache: "off" });
  });
  it.each([null, [], {}, { brief: 42 }, { brief: "x" }, { brief: "a".repeat(1501) }, { brief: "valid text", live: "yes" }])("rejects malformed input before inference: %j", async body => {
    const { app, askJev } = build();
    expect((await post(app, body)).status).toBe(400);
    expect(askJev).not.toHaveBeenCalled();
  });
  it("does not compose or play malformed model output", async () => {
    const { app } = build(true);
    const res = await post(app, { brief: C5_PRESETS[0].brief });
    expect(res.status).toBe(502);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("jev_invalid_answer");
  });
});
