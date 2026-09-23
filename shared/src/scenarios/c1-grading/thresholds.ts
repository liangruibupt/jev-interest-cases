export const C1_THRESHOLDS = {
  /** A rubric Noul at or above this counts as met. */
  yes: 0.7,
  /** At or below this counts as missed; in between → uncertain → teacher. */
  no: 0.3,
  /** on_topic below this zeroes the points. */
  onTopicMin: 0.5,
  /** misconception (other than none) confidence at or above this raises a flag. */
  misconceptionMin: 0.6,
  /** overall confidence below this → teacher. */
  teacherConfidence: 0.6,
  minSentences: 4,
  maxSentences: 6,
  /** |rubric-implied level − overall score| at or above this → teacher (rubric and holistic view disagree). */
  disagreement: 1.5,
} as const;
export type C1Thresholds = { -readonly [K in keyof typeof C1_THRESHOLDS]: number };
