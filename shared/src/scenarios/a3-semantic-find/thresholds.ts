export const A3_THRESHOLDS = {
  /** exists ≥ found → the document answers the query. */
  found: 0.7,
  /** exists ≤ absent → the document does not address it (whatever the Choice says). */
  absent: 0.35,
  /** spans_multiple ≥ spans → highlight the top three lines instead of one. */
  spans: 0.6,
  /** Lines below this probability are not listed. */
  minShow: 0.03,
  topN: 5,
} as const;
export type A3Thresholds = typeof A3_THRESHOLDS;
