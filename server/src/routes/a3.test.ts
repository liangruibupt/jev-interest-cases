import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createA3Routes } from "./a3";

function build() {
  const askJev = vi.fn(async (input: { state: unknown; questions: Record<string, { criteria?: unknown }> }, _opts: unknown) => {
    const probs: Record<string, number> = Object.fromEntries(Object.keys((input.questions.where as { criteria: Record<string, null> }).criteria).map((k) => [k, 0]));
    probs.L052 = 0.9; probs.L053 = 0.1;
    const answers = {
      where: { type: "choice", choice: "L052", probabilities: probs, confidence: 0.88 },
      exists: { type: "noul", noul: 0.95 },
      spans_multiple: { type: "noul", noul: 0.2 },
    };
    const trace: JevTrace = {
      kind: "jev", id: "t1", scenario: "a3", startedAt: "", latencyMs: 700, cached: false, model: "jev-1.13.0",
      request: { state: input.state as never, questions: input.questions as never, model: "jev-latest" },
      response: { answers: answers as never, usage: { input_tokens: 11000, output_tokens: 10 } },
      cost: { usd: 0.000462 },
    };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  return { app: createA3Routes({ askJev: askJev as never }), askJev };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/a3/search", () => {
  it("sends the tagged document with a 218-option choice and returns the composed result (preset → read-write cache)", async () => {
    const { app, askJev } = build();
    const res = await post(app, { query: "who owns the code I upload?" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { status: string; ranked: { lineId: string }[] }; traces: unknown[]; lineCount: number };
    expect(body.result.status).toBe("answered");
    expect(body.result.ranked[0]?.lineId).toBe("L052");
    expect(body.lineCount).toBe(218);
    expect(body.traces).toHaveLength(1);
    const call = askJev.mock.calls[0]!;
    const q = call[0].questions.where as { criteria: Record<string, null> };
    expect(Object.keys(q.criteria)).toHaveLength(218);
    expect((call[0].state as string).startsWith("L000| ")).toBe(true);
    expect(call[1]).toEqual({ cache: "read-write" });
  });

  it("uses read-only cache for free-text queries and rejects empty / long ones", async () => {
    const { app, askJev } = build();
    const ok = await post(app, { query: "  is there a fee for private repositories? " });
    expect(ok.status).toBe(200);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-only" });
    expect((await post(app, { query: "   " })).status).toBe(400);
    expect((await post(app, { query: "x".repeat(201) })).status).toBe(400);
    expect(askJev).toHaveBeenCalledTimes(1);
  });
});
