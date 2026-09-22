import { describe, expect, it } from "vitest";
import type { Questions } from "./types";
import { QuestionValidationError, assertValidQuestions, validateQuestions } from "./validate";

const valid: Questions = {
  dept: { type: "choice", instructions: "Which team?", criteria: { billing: null, tech: null } },
  sev: { type: "score", instructions: "How severe?", criteria: ["Cosmetic", "Degraded", "Blocking"] },
  urgent: { type: "noul", instructions: "Is it urgent?" },
};

describe("validateQuestions", () => {
  it("accepts a valid mixed set", () => {
    expect(validateQuestions(valid)).toEqual([]);
    expect(() => assertValidQuestions(valid)).not.toThrow();
  });

  it("rejects an empty question map", () => {
    expect(validateQuestions({})[0]?.message).toMatch(/至少/);
  });

  it("rejects a Choice with fewer than 2 or more than 255 options", () => {
    const one: Questions = { q: { type: "choice", instructions: "?", criteria: { a: null } } };
    expect(validateQuestions(one)).toHaveLength(1);
    const many = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, null]));
    const tooMany: Questions = { q: { type: "choice", instructions: "?", criteria: many } };
    expect(validateQuestions(tooMany)[0]?.message).toMatch(/255/);
  });

  it("rejects a Score with fewer than 2 or more than 10 levels", () => {
    const one = { q: { type: "score", instructions: "?", criteria: ["only"] } } as unknown as Questions;
    expect(validateQuestions(one)).toHaveLength(1);
    const eleven = { q: { type: "score", instructions: "?", criteria: Array.from({ length: 11 }, (_, i) => `L${i}`) } } as unknown as Questions;
    expect(validateQuestions(eleven)[0]?.message).toMatch(/10/);
  });

  it("rejects unknown types and blank ids", () => {
    const bad = { " ": { type: "vibe", instructions: "?" } } as unknown as Questions;
    const issues = validateQuestions(bad);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/ID/);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/type/);
  });

  it("assertValidQuestions throws a typed error listing issues", () => {
    expect(() => assertValidQuestions({})).toThrow(QuestionValidationError);
    try {
      assertValidQuestions({});
    } catch (e) {
      expect((e as QuestionValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});
