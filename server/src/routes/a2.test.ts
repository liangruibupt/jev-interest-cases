import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createA2Routes } from "./a2";

const answers = {
  department: { type: "choice", choice: "billing", probabilities: { billing: 0.9, orders: 0.1, account: 0, technical: 0, other: 0 }, confidence: 0.85 },
  frustration: { type: "score", score: 1, probabilities: { "0": 0, "1": 1, "2": 0 }, legend: { "0": "a", "1": "b", "2": "c" }, confidence: 1 },
};

function build() {
  let n = 0;
  const askJev = vi.fn(async (input: { state: unknown }, _opts: unknown) => {
    n += 1;
    const trace: JevTrace = {
      kind: "jev", id: `t${n}`, scenario: "a2", startedAt: "", latencyMs: 100, cached: false, model: "jev-1.13.0",
      request: { state: input.state as never, questions: {}, model: "jev-latest" },
      response: { answers: answers as never, usage: { input_tokens: 700, output_tokens: 10 } },
      cost: { usd: 0.0000294 },
    };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  return { app: createA2Routes({ askJev: askJev as never }), askJev };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/a2/evaluate", () => {
  it("fans out one request per ticket (all 24 by default) and returns answers keyed by ticket id", async () => {
    const { app, askJev } = build();
    const res = await post(app, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Record<string, { answers: unknown; traceId: string }>; traces: unknown[]; model: string };
    expect(askJev).toHaveBeenCalledTimes(24);
    expect(Object.keys(body.results)).toHaveLength(24);
    expect(body.results.T01?.traceId).toMatch(/^t\d+$/);
    expect(body.traces).toHaveLength(24);
    expect(body.model).toBe("jev-1.13.0");
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    const state = askJev.mock.calls[0]?.[0] as { state: { ticket: { message: string }; policy: unknown } };
    expect(state.state.ticket.message).toBeTruthy();
    expect(state.state.policy).toBeDefined();
  });

  it("evaluates only the requested ids, live mode bypasses cache", async () => {
    const { app, askJev } = build();
    const res = await post(app, { ticketIds: ["T21", "T22"], live: true });
    const body = (await res.json()) as { results: Record<string, unknown> };
    expect(askJev).toHaveBeenCalledTimes(2);
    expect(Object.keys(body.results).sort()).toEqual(["T21", "T22"]);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
  });

  it("rejects unknown ticket ids with 400", async () => {
    const { app, askJev } = build();
    const res = await post(app, { ticketIds: ["T99"] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
    expect(askJev).not.toHaveBeenCalled();
  });
});
