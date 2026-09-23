import type { Questions } from "./types";

export const MAX_CHOICE_OPTIONS = 255;
export const MIN_CHOICE_OPTIONS = 2;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

export interface ValidationIssue {
  questionId: string;
  message: string;
}

export class QuestionValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map((i) => (i.questionId ? `${i.questionId}: ${i.message}` : i.message)).join("; "));
    this.name = "QuestionValidationError";
    this.issues = issues;
  }
}

/** Client-side checks mirroring the API limits so a 422 from Jev is always a real bug. */
export function validateQuestions(questions: Questions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entries = Object.entries(questions ?? {});
  if (entries.length === 0) {
    issues.push({ questionId: "", message: "至少需要一个问题" });
    return issues;
  }
  for (const [id, q] of entries) {
    if (!id.trim()) issues.push({ questionId: id, message: "问题 ID 不能为空" });
    if (!q || typeof q !== "object" || !("type" in q)) {
      issues.push({ questionId: id, message: "缺少 type 字段" });
      continue;
    }
    const instr = (q as { instructions?: unknown }).instructions;
    if (instr === undefined || instr === null || (typeof instr === "string" && !instr.trim())) {
      issues.push({ questionId: id, message: "instructions 不能为空（问题 ID 不会发给模型）" });
    }
    switch (q.type) {
      case "choice": {
        const n = Object.keys(q.criteria ?? {}).length;
        if (n < MIN_CHOICE_OPTIONS) issues.push({ questionId: id, message: `Choice 至少需要 ${MIN_CHOICE_OPTIONS} 个选项` });
        if (n > MAX_CHOICE_OPTIONS) issues.push({ questionId: id, message: `Choice 最多 ${MAX_CHOICE_OPTIONS} 个选项，当前 ${n}` });
        break;
      }
      case "score": {
        const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
        if (n < MIN_SCORE_LEVELS) issues.push({ questionId: id, message: `Score 至少需要 ${MIN_SCORE_LEVELS} 个等级` });
        if (n > MAX_SCORE_LEVELS) issues.push({ questionId: id, message: `Score 最多 ${MAX_SCORE_LEVELS} 个等级，当前 ${n}` });
        break;
      }
      case "noul":
        break;
      default:
        issues.push({ questionId: id, message: `未知的 type：${String((q as { type: unknown }).type)}` });
    }
  }
  return issues;
}

export function assertValidQuestions(questions: Questions): void {
  const issues = validateQuestions(questions);
  if (issues.length > 0) throw new QuestionValidationError(issues);
}
