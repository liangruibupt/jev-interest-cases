import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createA1Routes } from "./a1";

const trace: JevTrace = {
  kind: "jev", id: "t1", scenario: "a1", startedAt: "", latencyMs: 120, cached: false, model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 300, output_tokens: 10 } },
  cost: { usd: 0.0000126 },
};

function build() {
  const askJev = vi.fn(async (_input: unknown, _opts: unknown) => ({ result: { model: trace.model, answers: trace.response.answers, usage: trace.response.usage }, trace }));
  return { app: createA1Routes({ askJev: askJev as never }), askJev };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/a1/evaluate", () => {
  it("evaluates and returns answers plus traces; normal mode reads the cache but never writes it", async () => {
    const { app, askJev } = build();
    const res = await post(app, { state: "s", questions: { q: { type: "noul", instructions: "?" } } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answers: { q: { noul: number } }; traces: unknown[]; model: string };
    expect(body.answers.q.noul).toBe(0.9);
    expect(body.traces).toHaveLength(1);
    expect(body.model).toBe("jev-1.13.0");
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-only" });
  });

  it("live mode bypasses the cache", async () => {
    const { app, askJev } = build();
    await post(app, { state: "s", questions: { q: { type: "noul", instructions: "?" } }, live: true });
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
  });

  it("rejects too many questions or an oversized state with 400", async () => {
    const { app, askJev } = build();
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`q${i}`, { type: "noul", instructions: "?" }]));
    expect((await post(app, { state: "s", questions: many })).status).toBe(400);
    expect((await post(app, { state: "x".repeat(12_001), questions: { q: { type: "noul", instructions: "?" } } })).status).toBe(400);
    expect(askJev).not.toHaveBeenCalled();
  });
});
