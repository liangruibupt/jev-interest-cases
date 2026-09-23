import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createC3Routes } from "./c3";

const answers = {
  event_type: { type: "choice", choice: "guidance_change", probabilities: { guidance_change: 0.9, other: 0.1 }, confidence: 0.85 },
  materiality: { type: "score", score: 2.4, probabilities: { "0": 0, "1": 0, "2": 0.6, "3": 0.4 }, legend: {}, confidence: 0.7 },
};

function build(opts: { failId?: string } = {}) {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { headline: string } }, _opts: unknown) => {
    n += 1;
    if (opts.failId && input.state.headline.startsWith(opts.failId)) throw new Error("Jev 限流（模拟）");
    const trace: JevTrace = { kind: "jev", id: `t${n}`, scenario: "c3", startedAt: "", latencyMs: 300, cached: false, model: "jev-1.13.0", request: { state: input.state as never, questions: {}, model: "jev-latest" }, response: { answers: answers as never, usage: { input_tokens: 700, output_tokens: 8 } }, cost: { usd: 0.0000294 } };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  return { app: createC3Routes({ askJev: askJev as never }), askJev };
}
const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/c3/judge", () => {
  it("fans out one Jev request per filing (15 by default, read-write) with company/source/headline/text as state", async () => {
    const { app, askJev } = build();
    const res = await post(app, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Record<string, unknown>; traces: unknown[] };
    expect(Object.keys(body.results)).toHaveLength(15);
    expect(askJev).toHaveBeenCalledTimes(15);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    expect(askJev.mock.calls[0]?.[0].state).toMatchObject({ company: "Northwind Foods", source: "8-K" });
  });
  it("selects ids, live bypasses cache, validation and partial failure", async () => {
    const { app, askJev } = build({ failId: "Northwind Foods introduces" });
    const body = (await (await post(app, { ids: ["F01", "F06"], live: true })).json()) as { results: Record<string, unknown>; errors: Record<string, string> };
    expect(Object.keys(body.results)).toEqual(["F01"]);
    expect(body.errors.F06).toMatch(/模拟/);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
    expect((await post(app, { ids: ["F99"] })).status).toBe(400);
    expect((await post(app, { ids: "F01" })).status).toBe(400);
    expect((await post(app, null)).status).toBe(200);
  });
});
