import { describe, expect, it } from "vitest";
import { validateQuestions } from "../../validate";
import { A2_QUESTIONS, A2_QUESTION_IDS } from "./questions";

describe("A2_QUESTIONS", () => {
  it("validates and has exactly the 10 planned ids", () => {
    expect(validateQuestions(A2_QUESTIONS)).toEqual([]);
    expect(Object.keys(A2_QUESTIONS)).toEqual([...A2_QUESTION_IDS]);
    expect(A2_QUESTION_IDS).toHaveLength(10);
  });
  it("describes departments contrastively", () => {
    const dept = A2_QUESTIONS.department;
    expect(dept.type).toBe("choice");
    if (dept.type === "choice") {
      expect(Object.keys(dept.criteria)).toEqual(["billing", "orders", "account", "technical", "other"]);
      const billing = dept.criteria.billing as { what: string; not_for: string; examples: string[] };
      expect(billing.what).toBeTruthy();
      expect(billing.not_for).toBeTruthy();
      expect(billing.examples.length).toBeGreaterThan(0);
    }
  });
});
