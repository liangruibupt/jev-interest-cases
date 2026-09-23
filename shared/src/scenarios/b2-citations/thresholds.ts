export const B2_THRESHOLDS = {
  /** relation.confidence at or above this → verdict stands without a human; below → review. */
  autoAccept: 0.8,
  /** quote_supports at or above this while the section verdict is not "verified" → flag the disagreement. */
  quoteSupportsYes: 0.7,
} as const;
export type B2Thresholds = typeof B2_THRESHOLDS;
