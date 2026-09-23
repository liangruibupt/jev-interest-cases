import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createC2Routes } from "./c2";

const answers = {
  urgency: { type: "score", score: 0.4, probabilities: { "0": 0.6, "1": 0.4, "2": 0, "3": 0 }, legend: {}, confidence: 0.8 },
  department: { type: "choice", choice: "scheduling", probabilities: { scheduling: 0.9, billing: 0.1 }, confidence: 0.85 },
};

function build(opts: { failId?: string } = {}) {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { message: string; channel: string } }, _opts: unknown) => {
    n += 1;
    if (opts.failId && input.state.message.startsWith(opts.failId)) throw new Error("Jev 限流（模拟）");
    const trace: JevTrace = { kind: "jev", id: `t${n}`, scenario: "c2", startedAt: "", latencyMs: 300, cached: false, model: "jev-1.13.0", request: { state: input.state as never, questions: {}, model: "jev-latest" }, response: { answers: answers as never, usage: { input_tokens: 800, output_tokens: 11 } }, cost: { usd: 0.0000336 } };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  return { app: createC2Routes({ askJev: askJev as never }), askJev };
}
const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/triage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/c2/triage", () => {
  it("fans out one Jev request per message (16 by default, read-write) with message + channel as state", async () => {
    const { app, askJev } = build();
    const res = await post(app, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Record<string, unknown>; traces: unknown[] };
    expect(Object.keys(body.results)).toHaveLength(16);
    expect(askJev).toHaveBeenCalledTimes(16);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    const state = askJev.mock.calls[0]?.[0].state;
    expect(state?.channel).toBe("portal");
    expect(state?.message).toMatch(/chest/);
    expect(body.traces).toHaveLength(16);
  });
  it("selects ids, live bypasses cache, unknown id / null body handled", async () => {
    const { app, askJev } = build();
    const res = await post(app, { ids: ["P06", "P16"], live: true });
    const body = (await res.json()) as { results: Record<string, unknown> };
    expect(Object.keys(body.results).sort()).toEqual(["P06", "P16"]);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
    expect((await post(app, { ids: ["P99"] })).status).toBe(400);
    expect((await post(app, { ids: "P01" })).status).toBe(400);
    expect((await post(app, null)).status).toBe(200);
  });
  it("keeps the other messages when one Jev call fails", async () => {
    const { app } = build({ failId: "Hi, I'm down to my last" });
    const body = (await (await post(app, {})).json()) as { results: Record<string, unknown>; errors: Record<string, string>; traces: unknown[] };
    expect(Object.keys(body.results)).toHaveLength(15);
    expect(body.errors.P02).toMatch(/模拟/);
    expect(body.traces).toHaveLength(15);
  });
});
