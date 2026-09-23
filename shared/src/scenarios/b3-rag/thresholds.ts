export const B3_THRESHOLDS = {
  /** contains_prompt_injection above this → excluded, whatever else it says. */
  injectionMax: 0.7,
  /** contradicts_query_premise at or above this → shown to Claude as conflicting evidence. */
  contradictsMin: 0.7,
  /** is_relevant below this → excluded as irrelevant. */
  relevantMin: 0.45,
  /** contains_answer_evidence at or above this → accepted. */
  evidenceMin: 0.55,
} as const;
export type B3Thresholds = typeof B3_THRESHOLDS;
