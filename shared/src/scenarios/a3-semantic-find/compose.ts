import type { Answers } from "../../types";
import { A3_LINES } from "./buildState";
import { A3_THRESHOLDS, type A3Thresholds } from "./thresholds";

export { A3_THRESHOLDS };

export type A3Status = "answered" | "partial" | "absent";

export const A3_STATUS_ZH: Record<A3Status, string> = { answered: "文档已回答", partial: "部分涉及", absent: "文档未涉及" };

export interface RankedLine {
  lineId: string;
  index: number;
  prob: number;
  text: string;
}

export interface A3Result {
  status: A3Status;
  exists: number;
  spansMultiple: number;
  ranked: RankedLine[];
  /** How many top lines to highlight (3 when the answer spans several lines). */
  highlightCount: number;
  /** What a bare Choice would report — always some line, even when the document says nothing. */
  naiveTop: { lineId: string; prob: number };
}

export function composeFind(answers: Answers, lines: readonly string[] = A3_LINES, t: A3Thresholds = A3_THRESHOLDS): A3Result {
  const where = answers.where;
  const probs = where && where.type === "choice" ? where.probabilities : {};
  const exists = answers.exists?.type === "noul" ? answers.exists.noul : 0;
  const spansMultiple = answers.spans_multiple?.type === "noul" ? answers.spans_multiple.noul : 0;
  const sorted = Object.entries(probs)
    .map(([lineId, prob]) => ({ lineId, prob, index: Number(lineId.slice(1)) }))
    .sort((a, b) => b.prob - a.prob);
  const ranked: RankedLine[] = sorted
    .filter((x) => x.prob >= t.minShow)
    .slice(0, t.topN)
    .map((x) => ({ ...x, text: lines[x.index] ?? "" }));
  const status: A3Status = exists >= t.found ? "answered" : exists <= t.absent ? "absent" : "partial";
  const top = sorted[0] ?? { lineId: "L000", prob: 0 };
  return { status, exists, spansMultiple, ranked, highlightCount: spansMultiple >= t.spans ? 3 : 1, naiveTop: { lineId: top.lineId, prob: top.prob } };
}
