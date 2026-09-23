import type { Answers } from "../../types";
import type { Citation, Verdict } from "./citations";
import { findQuoteAnywhere, locateQuote } from "./match";
import type { RfcSection } from "./sections";
import { B2_THRESHOLDS, type B2Thresholds } from "./thresholds";

export { B2_THRESHOLDS };

export interface ClaimVerdict {
  id: string;
  verdict: Verdict;
  /** True when a human should confirm (low relation confidence). String-stage verdicts never need review. */
  review: boolean;
  relation?: { choice: string; probabilities: Record<string, number>; confidence: number | null };
  quoteSupports?: number;
  /** The quote alone reads as supporting, but the section as a whole does not. */
  disagreement?: boolean;
  /** For misattributed quotes: the section that really contains the quote. */
  matchedIn?: string;
  reason_zh: string;
}

export const VERDICT_LABELS_ZH: Record<Verdict, string> = {
  verified: "已核实",
  contradicted: "相矛盾",
  unsupported: "无依据",
  fabricated: "捏造引文",
  misattributed: "误标章节",
};

/** Stage 1 (code only): is the quote really in the cited section? Returns null when Jev must decide. */
export function stringStage(c: Citation, sections: RfcSection[]): ClaimVerdict | null {
  const section = sections.find((s) => s.id === c.section_id);
  if (section && locateQuote(c.quote, section).found) return null;
  const elsewhere = findQuoteAnywhere(c.quote, sections);
  if (elsewhere) return { id: c.id, verdict: "misattributed", review: false, matchedIn: elsewhere, reason_zh: `引文不在第 ${c.section_id} 节，而在第 ${elsewhere} 节（字符串匹配，未调用模型）` };
  return { id: c.id, verdict: "fabricated", review: false, reason_zh: "引文在文档任何章节都找不到（字符串匹配，未调用模型）" };
}

/** Stage 2: Jev's relation judgement plus the quote-level cross-check. */
export function verdictFromAnswers(c: Citation, answers: Answers, t: B2Thresholds = B2_THRESHOLDS): ClaimVerdict {
  const rel = answers.relation;
  const qs = answers.quote_supports;
  const choice = rel && rel.type === "choice" ? rel.choice : "says_nothing";
  const confidence = rel && rel.type === "choice" ? rel.confidence : null;
  const quoteSupports = qs && qs.type === "noul" ? qs.noul : undefined;
  const verdict: Verdict = choice === "supports" ? "verified" : choice === "contradicts" ? "contradicted" : "unsupported";
  const review = (confidence ?? 0) < t.autoAccept;
  const disagreement = quoteSupports !== undefined && quoteSupports >= t.quoteSupportsYes && verdict !== "verified";
  const reasons = [`relation=${choice}（置信 ${(confidence ?? 0).toFixed(2)}${review ? ` < ${t.autoAccept}，需人工确认` : ""}）`];
  if (quoteSupports !== undefined) reasons.push(`quote_supports=${quoteSupports.toFixed(2)}${disagreement ? "：引文单看支持，但上下文不支持" : ""}`);
  return {
    id: c.id,
    verdict,
    review,
    relation: rel && rel.type === "choice" ? { choice: rel.choice, probabilities: rel.probabilities, confidence: rel.confidence } : undefined,
    quoteSupports,
    disagreement,
    reason_zh: reasons.join("；"),
  };
}
