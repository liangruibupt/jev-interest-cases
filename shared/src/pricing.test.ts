import { describe, expect, it } from "vitest";
import { CLAUDE_TIERS, claudeCostUsd, jevCostUsd } from "./pricing";

describe("pricing", () => {
  it("prices Jev input at $0.042 per million tokens and output free", () => {
    expect(jevCostUsd(1_000_000)).toBeCloseTo(0.042, 6);
    expect(jevCostUsd(1_000_000, 5_000_000)).toBeCloseTo(0.042, 6);
    expect(jevCostUsd(0)).toBe(0);
  });

  it("prices Claude tiers from the table", () => {
    expect(claudeCostUsd("standard", 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
    expect(claudeCostUsd("strong", 1_000_000, 0)).toBeCloseTo(5, 6);
    expect(claudeCostUsd("prev_sonnet", 0, 1_000_000)).toBeCloseTo(15, 6);
  });

  it("marks only the 4.6 family as supporting temperature and haiku as disabled", () => {
    expect(CLAUDE_TIERS.prev_sonnet.supportsTemperature).toBe(true);
    expect(CLAUDE_TIERS.standard.supportsTemperature).toBe(false);
    expect(CLAUDE_TIERS.haiku.enabledByDefault).toBe(false);
    expect(CLAUDE_TIERS.standard.modelId).toBe("global.anthropic.claude-sonnet-5");
  });
});
