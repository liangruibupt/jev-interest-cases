/**
 * Tuned on the first cache-off run (see docs/scenarios/C3.md): the four situational levels put "significant to
 * results, operations, leadership, or a major product/customer" at 2 and "valuation-changing" at 3, and Jev scored
 * guidance cuts, lost customers and lost lawsuits at 1.9–2.2. 立即看 therefore starts where the "significant" band
 * is solid (1.8), 今日看 where an item is clearly more than routine (1.1).
 */
export const C3_THRESHOLDS = {
  /** materiality at or above → 立即看. */
  readNow: 1.8,
  /** materiality at or above → 今日看. */
  today: 1.1,
  /** accounting / key-person / forward-looking Nouls at or above → flag (accounting also forces 立即看). */
  flag: 0.7,
  /** hedged_language at or above → flag; with materiality ≥ hedgedMateriality it lifts the item to 今日看. */
  hedged: 0.6,
  hedgedMateriality: 0.8,
  /** boilerplate at or above with materiality below `today` → 归档. */
  boilerplate: 0.7,
} as const;
export type C3Thresholds = { -readonly [K in keyof typeof C3_THRESHOLDS]: number };
