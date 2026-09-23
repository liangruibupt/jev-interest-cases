export const C4_THRESHOLDS = {
  /** applies_region / applies_asset / names_site / requires_action / is_test at or above → yes. */
  act: 0.7,
  /** applicability in [review, act) → 复核. */
  review: 0.35,
  /** urgency at or above → 立即行动, below → 排期. */
  urgencyNow: 1.5,
  /** Alarms and customer requests are about one site: names_site at or above this makes them applicable, below `review` not. */
  namesSiteMin: 0.5,
} as const;
export type C4Thresholds = { -readonly [K in keyof typeof C4_THRESHOLDS]: number };
