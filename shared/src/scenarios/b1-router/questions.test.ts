import { describe, expect, it } from "vitest";
import { validateQuestions } from "../../validate";
import { FAQ } from "./faq";
import { B1_QUESTIONS, B1_QUESTION_IDS } from "./questions";

describe("B1_QUESTIONS", () => {
  it("validates and has the 10 planned ids", () => {
    expect(validateQuestions(B1_QUESTIONS)).toEqual([]);
    expect(Object.keys(B1_QUESTIONS)).toEqual([...B1_QUESTION_IDS]);
  });
  it("faq_topic options are the FAQ keys plus none", () => {
    const q = B1_QUESTIONS.faq_topic;
    if (q.type !== "choice") throw new Error("faq_topic must be a choice");
    expect(Object.keys(q.criteria)).toEqual([...Object.keys(FAQ), "none"]);
  });
});
