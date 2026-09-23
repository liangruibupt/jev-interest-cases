import { ASSIGNMENT, type Essay, type MisconceptionId, type RubricId } from "../../datasets/essays";
import type { Answers } from "../../types";
import { MISCONCEPTIONS } from "./questions";
import { countSentences } from "./sentences";
import { C1_THRESHOLDS, type C1Thresholds } from "./thresholds";

export type CriterionStatus = "met" | "missed" | "uncertain";

export interface Grade {
  points: number;
  maxPoints: number;
  /** Jev's holistic level 0–3 (probability-weighted score). */
  level: number;
  levelConfidence: number | null;
  levelProbabilities: Record<string, number>;
  criteria: { id: RubricId; status: CriterionStatus; value: number }[];
  onTopic: number;
  misconception: { choice: MisconceptionId; confidence: number; probabilities: Record<string, number> } | null;
  clarity: number | null;
  sentences: number;
  flags: string[];
  needsTeacher: boolean;
  reasons: string[];
}

export const STATUS_ZH: Record<CriterionStatus, string> = { met: "达到", missed: "未达到", uncertain: "不确定" };
export const MISCONCEPTION_ZH: Record<MisconceptionId, string> = {
  none: "无",
  reflects_ocean: "天空反射海洋",
  air_is_blue: "气体本身是蓝色",
  refraction_not_scattering: "折射（棱镜）而非散射",
  other_misconception: "其它错误概念",
};

/** Pure: answers + the answer text (for sentence counting) → grade. Re-run in the browser when sliders move. */
export function gradeFromAnswers(answers: Answers, text: string, t: C1Thresholds = C1_THRESHOLDS): Grade {
  const reasons: string[] = [];
  const flags: string[] = [];
  const noul = (id: string): number => {
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };

  const criteria = ASSIGNMENT.rubric.map((r) => {
    const value = noul(r.id);
    const status: CriterionStatus = value >= t.yes ? "met" : value <= t.no ? "missed" : "uncertain";
    return { id: r.id, status, value };
  });
  const uncertain = criteria.filter((c) => c.status === "uncertain");
  if (uncertain.length) reasons.push(`${uncertain.length} 条细则落在 ${t.no}–${t.yes} 的灰区：${uncertain.map((c) => c.id).join("、")}`);

  const onTopic = noul("on_topic");
  let points = criteria.filter((c) => c.status === "met").length;
  if (onTopic < t.onTopicMin) {
    flags.push("off_topic");
    points = 0;
    reasons.push(`on_topic ${onTopic.toFixed(2)} < ${t.onTopicMin} → 计 0 分`);
  }

  const sentences = countSentences(text);
  if (sentences < t.minSentences) flags.push("too_short");
  if (sentences > t.maxSentences) flags.push("too_long");

  const overall = answers.overall;
  const level = overall && overall.type === "score" ? overall.score : 0;
  const levelConfidence = overall && overall.type === "score" ? overall.confidence : null;
  const levelProbabilities = overall && overall.type === "score" ? overall.probabilities : {};
  if (levelConfidence !== null && levelConfidence < t.teacherConfidence) reasons.push(`overall 置信度 ${levelConfidence.toFixed(2)} < ${t.teacherConfidence}`);
  const impliedLevel = (points / ASSIGNMENT.rubric.length) * 3;
  if (!flags.includes("off_topic") && Math.abs(impliedLevel - level) >= t.disagreement) reasons.push(`细则得分折算 ${impliedLevel.toFixed(1)} 与整体水平 ${level.toFixed(1)} 相差 ≥ ${t.disagreement}`);

  const m = answers.misconception;
  let misconception: Grade["misconception"] = null;
  if (m && m.type === "choice" && MISCONCEPTIONS.includes(m.choice as MisconceptionId)) {
    misconception = { choice: m.choice as MisconceptionId, confidence: m.confidence ?? 0, probabilities: m.probabilities };
    if (m.choice !== "none") {
      if (misconception.confidence >= t.misconceptionMin) flags.push(`misconception:${m.choice}`);
      else if (misconception.confidence > 0.4) reasons.push(`错误概念 ${m.choice} 置信度 ${misconception.confidence.toFixed(2)} 不确定`);
    }
  }

  const c = answers.clarity;
  const clarity = c && c.type === "score" ? c.score : null;

  return {
    points,
    maxPoints: ASSIGNMENT.rubric.length,
    level,
    levelConfidence,
    levelProbabilities,
    criteria,
    onTopic,
    misconception,
    clarity,
    sentences,
    flags,
    needsTeacher: reasons.length > 0,
    reasons,
  };
}

export const C1_FEEDBACK_QUESTIONS = {
  feedback_consistent: {
    type: "noul",
    instructions: "Does `feedback` agree with `rubric_results`: it does not praise a criterion marked missed, and does not fault a criterion marked met?",
  },
  feedback_specific: {
    type: "noul",
    instructions: "Does `feedback` refer to specific content of `answer` rather than only giving generic praise or generic advice?",
  },
  feedback_kind: {
    type: "noul",
    instructions: "Is the tone of `feedback` encouraging and appropriate for a 13-year-old student?",
  },
} as const;

export function buildFeedbackState(e: Essay, grade: Grade, feedback: string): { answer: string; rubric_results: Record<string, CriterionStatus>; misconception: MisconceptionId; feedback: string } {
  return {
    answer: e.text,
    rubric_results: Object.fromEntries(grade.criteria.map((c) => [c.id, c.status])),
    misconception: grade.misconception?.choice ?? "none",
    feedback,
  };
}
