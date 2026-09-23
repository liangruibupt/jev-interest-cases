import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createC4Routes } from "./c4";

const answers = {
  notice_type: { type: "choice", choice: "market_information", probabilities: { market_information: 1 }, confidence: 0.9 },
  applies_region: { type: "noul", noul: 0.9 },
};

function build(opts: { failSite?: string } = {}) {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { site: { name: string } } }, _opts: unknown) => {
    n += 1;
    if (opts.failSite && input.state.site.name === opts.failSite) throw new Error("Jev 限流（模拟）");
    const trace: JevTrace = { kind: "jev", id: `t${n}`, scenario: "c4", startedAt: "", latencyMs: 300, cached: false, model: "jev-1.13.0", request: { state: input.state as never, questions: {}, model: "jev-latest" }, response: { answers: answers as never, usage: { input_tokens: 500, output_tokens: 8 } }, cost: { usd: 0.000021 } };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  return { app: createC4Routes({ askJev: askJev as never }), askJev };
}
const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/c4/apply", () => {
  it("fans out one Jev request per (notice, site) pair — 36 by default — keyed notice:site", async () => {
    const { app, askJev } = build();
    const res = await post(app, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Record<string, unknown>; traces: unknown[] };
    expect(Object.keys(body.results)).toHaveLength(36);
    expect(body.results["N01:S1"]).toBeDefined();
    expect(askJev).toHaveBeenCalledTimes(36);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    expect(askJev.mock.calls[0]?.[0].state.site).toMatchObject({ name: "Harbor Point BESS", region: "North Zone", asset_type: "battery_storage" });
  });
  it("selects notices, live bypasses cache, partial failure and validation", async () => {
    const { app, askJev } = build({ failSite: "Sunfield Solar+Storage" });
    const body = (await (await post(app, { noticeIds: ["N02"], live: true })).json()) as { results: Record<string, unknown>; errors: Record<string, string> };
    expect(Object.keys(body.results).sort()).toEqual(["N02:S1", "N02:S3"]);
    expect(body.errors["N02:S2"]).toMatch(/模拟/);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
    expect((await post(app, { noticeIds: ["N99"] })).status).toBe(400);
    expect((await post(app, { noticeIds: "N01" })).status).toBe(400);
    expect((await post(app, null)).status).toBe(200);
  });
});
