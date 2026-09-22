import { describe, expect, it } from "vitest";
import { estimateLlmBaseline } from "./costModel";
import type { JevTrace } from "./types";

const trace = (inputTokens: number, cached = false): JevTrace => ({
  kind: "jev",
  id: "t",
  scenario: "a2",
  startedAt: "2026-09-23T00:00:00Z",
  latencyMs: cached ? 0 : 120,
  cached,
  model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: inputTokens, output_tokens: 10 } },
  cost: { usd: cached ? 0 : (inputTokens / 1e6) * 0.042 },
});

describe("estimateLlmBaseline", () => {
  it("prices the same input tokens plus assumed output on the LLM tier", () => {
    const est = estimateLlmBaseline("a2", [trace(700), trace(700)], "standard");
    expect(est.calls).toBe(2);
    expect(est.inputTokens).toBe(1400);
    expect(est.outputTokens).toBe(2 * 250);
    expect(est.llmUsd).toBeCloseTo((1400 / 1e6) * 2 + (500 / 1e6) * 10, 9); // 0.0078
    expect(est.jevUsd).toBeCloseTo((1400 / 1e6) * 0.042, 9);
    expect(est.ratio).toBeCloseTo(0.0078 / 0.0000588, 1);
    expect(est.savingsPct).toBeGreaterThan(99);
  });

  it("uses token counts even when traces were served from cache", () => {
    const est = estimateLlmBaseline("a2", [trace(700, true)], "strong");
    expect(est.jevUsd).toBeGreaterThan(0);
    expect(est.tierLabel).toBe("Claude Opus 5");
  });

  it("returns zeros and null ratio for no traces", () => {
    const est = estimateLlmBaseline("a1", [], "standard");
    expect(est.llmUsd).toBe(0);
    expect(est.ratio).toBeNull();
    expect(est.savingsPct).toBe(0);
  });
});
