import { describe, expect, it } from "vitest";
import { B1_ROUTES } from "../scenarios/b1-router/policy";
import { GUARDRAIL_MESSAGES } from "./guardrailMessages";

describe("GUARDRAIL_MESSAGES", () => {
  it("has 16 unique messages with valid expected routes", () => {
    expect(GUARDRAIL_MESSAGES).toHaveLength(16);
    expect(new Set(GUARDRAIL_MESSAGES.map((m) => m.id)).size).toBe(16);
    for (const m of GUARDRAIL_MESSAGES) {
      expect(m.expected_routes.length).toBeGreaterThan(0);
      for (const r of m.expected_routes) expect(B1_ROUTES).toContain(r);
      expect(m.text.length).toBeGreaterThan(10);
    }
    expect(GUARDRAIL_MESSAGES.filter((m) => m.expected_routes[0] === "deterministic").length).toBeGreaterThanOrEqual(3);
    expect(GUARDRAIL_MESSAGES.some((m) => m.expected_routes[0] === "block")).toBe(true);
    expect(GUARDRAIL_MESSAGES.some((m) => m.expected_routes[0] === "support")).toBe(true);
  });
});
