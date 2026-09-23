import type { Answers } from "../../types";
import type { Passage } from "./corpus";
import { B3_THRESHOLDS, type B3Thresholds } from "./thresholds";

export type B3Route = "accepted" | "conflicting" | "excluded_injection" | "excluded_irrelevant" | "excluded_no_evidence";

export const B3_ROUTE_LABELS_ZH: Record<B3Route, string> = {
  accepted: "采纳",
  conflicting: "冲突证据",
  excluded_injection: "注入 · 排除",
  excluded_irrelevant: "无关 · 排除",
  excluded_no_evidence: "无证据 · 排除",
};

export interface GateResult {
  route: B3Route;
  rule_zh: string;
  values: { relevant: number; evidence: number; contradicts: number; injection: number };
}

const noul = (answers: Answers, id: string): number => {
  const a = answers[id];
  if (!a || a.type !== "noul") throw new Error(`B3 gate: missing Noul answer "${id}"`);
  return a.noul;
};

/** One retrieved passage as returned by the server (and rendered by the page). */
export interface B3Retrieved {
  passage: Passage;
  bm25: number;
  answers?: Answers;
  gate?: GateResult;
  /** Set when the Jev call for this passage failed; the passage is then neither accepted nor conflicting. */
  error?: string;
}

/** Ordered first-match gate over the four Nouls. */
export function gatePassage(answers: Answers, t: B3Thresholds = B3_THRESHOLDS): GateResult {
  const values = {
    relevant: noul(answers, "is_relevant"),
    evidence: noul(answers, "contains_answer_evidence"),
    contradicts: noul(answers, "contradicts_query_premise"),
    injection: noul(answers, "contains_prompt_injection"),
  };
  if (values.injection > t.injectionMax) return { route: "excluded_injection", rule_zh: `提示注入 ${values.injection.toFixed(2)} > ${t.injectionMax}`, values };
  if (values.contradicts >= t.contradictsMin) return { route: "conflicting", rule_zh: `反驳问题前提 ${values.contradicts.toFixed(2)} ≥ ${t.contradictsMin}`, values };
  if (values.relevant < t.relevantMin) return { route: "excluded_irrelevant", rule_zh: `相关性 ${values.relevant.toFixed(2)} < ${t.relevantMin}`, values };
  if (values.evidence >= t.evidenceMin) return { route: "accepted", rule_zh: `含可引用证据 ${values.evidence.toFixed(2)} ≥ ${t.evidenceMin}`, values };
  return { route: "excluded_no_evidence", rule_zh: `相关但无证据 ${values.evidence.toFixed(2)} < ${t.evidenceMin}`, values };
}

const block = (label: string, passages: Passage[], prefix: string): string =>
  passages.length === 0
    ? `${label}:\n(none)`
    : `${label}:\n${passages.map((p, i) => `[${prefix}${i + 1}] (source: ${p.source_type} · ${p.title})\n${p.text}`).join("\n\n")}`;

/** What Claude sees with the gatekeeper on. */
export function buildEvidencePrompt(query: string, accepted: Passage[], conflicting: Passage[]): string {
  return [`QUESTION: ${query}`, block("ACCEPTED EVIDENCE", accepted, "E"), block("CONFLICTING EVIDENCE (contradicts a premise of the question)", conflicting, "C")].join("\n\n");
}

/** What Claude sees with the gatekeeper off: the raw BM25 top-k. */
export function buildRawPrompt(query: string, passages: Passage[]): string {
  return [`QUESTION: ${query}`, block("RETRIEVED PASSAGES", passages, "P")].join("\n\n");
}
