import { describe, expect, it } from "vitest";
import { A2_QUESTIONS } from "../a2-triage/questions";
import { validateQuestions } from "../../validate";
import { A4_ARMS, A4_CASES, estimateRunCost } from "./index";

describe("A4 cases and arms", () => {
  it("both cases validate; moderation has 8 Choice questions, ticket has 6 mixed A2 questions", () => {
    expect(A4_CASES.map((c) => c.id)).toEqual(["moderation", "ticket"]);
    for (const c of A4_CASES) expect(validateQuestions(c.questions), c.id).toEqual([]);
    const mod = A4_CASES[0]!;
    expect(Object.values(mod.questions)).toHaveLength(8);
    expect(Object.values(mod.questions).every((q) => q.type === "choice")).toBe(true);
    const ticket = A4_CASES[1]!;
    const ids = Object.keys(ticket.questions);
    expect(ids).toHaveLength(6);
    for (const id of ids) expect(ticket.questions[id]).toEqual(A2_QUESTIONS[id as keyof typeof A2_QUESTIONS]);
    expect(new Set(Object.values(ticket.questions).map((q) => q.type)).size).toBe(3);
  });

  it("has one jev arm and LLM arms with tiers; only the 4.6 arms set temperature", () => {
    expect(A4_ARMS.filter((a) => a.kind === "jev")).toHaveLength(1);
    for (const a of A4_ARMS.filter((a) => a.kind === "llm")) {
      expect(a.tier).toBeDefined();
      if (a.temperature !== undefined) expect(a.tier).toBe("prev_sonnet");
    }
    expect(A4_ARMS.filter((a) => a.enabledByDefault).map((a) => a.id)).toEqual(["jev", "sonnet46_t0", "sonnet46", "sonnet5", "opus5"]);
  });

  it("estimates run cost from token assumptions and tier prices", () => {
    const est = estimateRunCost("moderation", ["jev", "sonnet5"], 15);
    expect(est.usd).toBeGreaterThan(0.05);
    expect(est.usd).toBeLessThan(0.2);
    expect(est.perArm.jev).toBeLessThan(est.perArm.sonnet5! / 50);
  });
});
