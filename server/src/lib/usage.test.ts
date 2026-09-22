import type { ClaudeTrace, JevTrace } from "@jev/shared";
import { describe, expect, it } from "vitest";
import { createUsage } from "./usage";

const jev = (usd: number, cached: boolean): JevTrace => ({
  kind: "jev", id: "j", scenario: "a1", startedAt: "", latencyMs: cached ? 0 : 100, cached, model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 400, output_tokens: 10 } },
  cost: { usd },
});
const claude: ClaudeTrace = { kind: "claude", id: "c", scenario: "b1", purpose: "reply", startedAt: "", latencyMs: 1500, tier: "standard", model: "m", inputTokens: 600, outputTokens: 300, cost: { usd: 0.0042 }, stopReason: "end_turn" };

describe("usage", () => {
  it("accumulates Jev and Claude separately and counts cached calls", () => {
    const u = createUsage();
    u.record(jev(0.0000168, false));
    u.record(jev(0, true));
    u.record(claude);
    const s = u.snapshot();
    expect(s.jev.calls).toBe(2);
    expect(s.jev.cached).toBe(1);
    expect(s.jev.usd).toBeCloseTo(0.0000168, 9);
    expect(s.jev.inputTokens).toBe(800);
    expect(s.claude.calls).toBe(1);
    expect(s.claude.usd).toBeCloseTo(0.0042, 9);
    expect(s.claude.totalLatencyMs).toBe(1500);
    u.reset();
    expect(u.snapshot().jev.calls).toBe(0);
  });
});
