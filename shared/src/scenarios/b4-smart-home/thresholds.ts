export const B4_THRESHOLDS = {
  /** category confidence below this → ask what the user meant. */
  categoryMin: 0.5,
  /** is_compound at or above this → let Claude split the request. */
  compound: 0.7,
  roomMin: 0.5,
  deviceMin: 0.6,
  actionMin: 0.5,
  /** Locking the door directly needs this much confidence; unlocking always asks. */
  lockMin: 0.85,
  /** is_question_about_state at or above this → answer from the home state. */
  stateQuestion: 0.7,
} as const;
export type B4Thresholds = typeof B4_THRESHOLDS;
