import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { ASSIGNMENT, ESSAYS } from "../../datasets/essays";
import { C1_FEEDBACK_QUESTIONS, C1_QUESTIONS, C1_QUESTION_IDS, C1_THRESHOLDS, MISCONCEPTIONS, buildEssayState, buildFeedbackState, countSentences, gradeFromAnswers } from "./index";

function answers(over: Partial<{ c1: number; c2: number; c3: number; c4: number; onTopic: number; mis: string; misConf: number; overall: number; overallConf: number }> = {}): Answers {
  const o = { c1: 0.95, c2: 0.95, c3: 0.95, c4: 0.95, onTopic: 0.98, mis: "none", misConf: 0.95, overall: 3, overallConf: 0.9, ...over };
  const lv = Math.round(o.overall);
  const probs: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  probs[String(lv)] = 1;
  return {
    cause_scattering: { type: "noul", noul: o.c1 },
    sunset_path: { type: "noul", noul: o.c2 },
    names_rayleigh: { type: "noul", noul: o.c3 },
    evidence_or_example: { type: "noul", noul: o.c4 },
    on_topic: { type: "noul", noul: o.onTopic },
    misconception: { type: "choice", choice: o.mis, probabilities: { [o.mis]: 1 }, confidence: o.misConf },
    overall: { type: "score", score: o.overall, probabilities: probs, legend: { "0": "a", "1": "b", "2": "c", "3": "d" }, confidence: o.overallConf },
    clarity: { type: "score", score: 2, probabilities: { "0": 0, "1": 0, "2": 1 }, legend: { "0": "a", "1": "b", "2": "c" }, confidence: 0.9 },
  };
}

describe("C1 dataset and questions", () => {
  it("has 12 essays with valid labels, and 8 valid questions", () => {
    expect(ESSAYS).toHaveLength(12);
    expect(new Set(ESSAYS.map((e) => e.id)).size).toBe(12);
    expect(ESSAYS.every((e) => e.expected.levels.every((l) => l >= 0 && l <= 3))).toBe(true);
    expect(validateQuestions(C1_QUESTIONS)).toEqual([]);
    expect(Object.keys(C1_QUESTIONS)).toEqual([...C1_QUESTION_IDS]);
    const mis = C1_QUESTIONS.misconception!;
    if (mis.type !== "choice") throw new Error("misconception must be a choice");
    expect(Object.keys(mis.criteria)).toEqual([...MISCONCEPTIONS]);
    const overall = C1_QUESTIONS.overall!;
    if (overall.type !== "score") throw new Error("overall must be a score");
    expect(overall.criteria).toHaveLength(4);
    expect(validateQuestions(C1_FEEDBACK_QUESTIONS)).toEqual([]);
    expect(buildEssayState(ESSAYS[0]!).assignment.prompt).toBe(ASSIGNMENT.prompt);
  });
});

describe("C1 sentence counting (code, not Jev)", () => {
  it("counts sentences and ignores abbreviations", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("Use e.g. milk in water. It looks blue.")).toBe(2);
    expect(countSentences("")).toBe(0);
    expect(countSentences("Because of scattering of blue light.")).toBe(1);
    expect(countSentences(ESSAYS[0]!.text)).toBeGreaterThanOrEqual(4);
    expect(countSentences(ESSAYS[4]!.text)).toBe(3);
    expect(countSentences(ESSAYS[7]!.text)).toBe(9);
    expect(countSentences("Red, orange, etc. The sunset is red. It is pretty.")).toBe(3);
    expect(countSentences('He said "It is blue." Then he left.')).toBe(2);
    expect(countSentences("天空是蓝的。因为散射。")).toBe(0);
  });
});

describe("C1 grade composition", () => {
  const t = C1_THRESHOLDS;
  const text4 = "One sentence here. Two sentences here. Three sentences here. Four sentences here.";
  it("maps rubric Nouls to met / missed / uncertain at the documented boundaries", () => {
    const g = gradeFromAnswers(answers({ c1: 0.7, c2: 0.3, c3: 0.5, c4: 0.29 }), text4, t);
    expect(g.criteria.map((c) => c.status)).toEqual(["met", "missed", "uncertain", "missed"]);
    expect(g.points).toBe(1);
    expect(g.maxPoints).toBe(4);
    expect(g.needsTeacher).toBe(true);
    expect(g.reasons[0]).toMatch(/灰区/);
  });
  it("a clean full-marks answer needs no teacher", () => {
    const g = gradeFromAnswers(answers(), text4, t);
    expect(g.points).toBe(4);
    expect(g.level).toBe(3);
    expect(g.flags).toEqual([]);
    expect(g.needsTeacher).toBe(false);
  });
  it("off-topic zeroes the points and goes to the teacher; sentence flags come from code", () => {
    const off = gradeFromAnswers(answers({ onTopic: 0.2, overall: 0 }), text4, t);
    expect(off.points).toBe(0);
    expect(off.flags).toContain("off_topic");
    expect(off.needsTeacher).toBe(true);
    expect(off.flags.some((f) => f.startsWith("misconception:"))).toBe(false);
    expect(gradeFromAnswers(answers(), "Short.", t).flags).toContain("too_short");
    expect(gradeFromAnswers(answers(), Array(8).fill("A sentence.").join(" "), t).flags).toContain("too_long");
  });
  it("judges misconceptions on the non-none probability mass: flag at 0.6, teacher in 0.4–0.6, nothing below", () => {
    expect(gradeFromAnswers(answers({ mis: "reflects_ocean", misConf: 0.6, overall: 1 }), text4, t).flags).toContain("misconception:reflects_ocean");
    const split = answers();
    (split.misconception as { probabilities: Record<string, number>; choice: string; confidence: number }).probabilities = { none: 0.45, other_misconception: 0.28, reflects_ocean: 0.27, air_is_blue: 0, refraction_not_scattering: 0 };
    const unsure = gradeFromAnswers(split, text4, t); // argmax is none, but 0.55 of the mass is on misconceptions
    expect(unsure.flags.some((f) => f.startsWith("misconception:"))).toBe(false);
    expect(unsure.needsTeacher).toBe(true);
    expect(unsure.reasons.join(" ")).toMatch(/错误概念概率质量 0.55/);
    const low = answers();
    (low.misconception as { probabilities: Record<string, number> }).probabilities = { none: 0.65, other_misconception: 0.35, reflects_ocean: 0, air_is_blue: 0, refraction_not_scattering: 0 };
    expect(gradeFromAnswers(low, text4, t).needsTeacher).toBe(false);
    const nullConf = answers({ mis: "air_is_blue", overall: 0 });
    (nullConf.misconception as { confidence: number | null }).confidence = null;
    expect(gradeFromAnswers(nullConf, text4, t).flags).toContain("misconception:air_is_blue");
  });
  it("routes low overall confidence and rubric/holistic disagreement to the teacher", () => {
    expect(gradeFromAnswers(answers({ overallConf: 0.59 }), text4, t).needsTeacher).toBe(true);
    const disagree = gradeFromAnswers(answers({ overall: 1 }), text4, t); // 4/4 criteria met but holistic level 1
    expect(disagree.needsTeacher).toBe(true);
    expect(disagree.reasons.join(" ")).toMatch(/相差/);
    expect(gradeFromAnswers(answers({ overall: 1.5 }), text4, t).reasons.join(" ")).toMatch(/相差/); // exactly 1.5 apart
    expect(gradeFromAnswers(answers({ overall: 1.6 }), text4, t).needsTeacher).toBe(false);
    const offTopicHigh = gradeFromAnswers(answers({ onTopic: 0.1, overall: 3 }), text4, t); // off-topic skips the disagreement rule
    expect(offTopicHigh.reasons.some((r) => r.includes("相差"))).toBe(false);
  });
  it("builds the feedback verification state from the grade", () => {
    const g = gradeFromAnswers(answers({ c3: 0.1 }), text4, t);
    const s = buildFeedbackState(ESSAYS[1]!, g, "Nice work!");
    expect(s.rubric_results.names_rayleigh).toBe("missed");
    expect(s.misconception).toBe("none");
    expect(s.feedback).toBe("Nice work!");
  });
});
