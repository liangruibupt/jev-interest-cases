/** Every knob of the B1 policy. Two presets; the page toggles between them without new inference. */
export interface B1Thresholds {
  /** A hazard Noul at or above this counts as "worth a look" (used with the severity rule). */
  review: number;
  /** A hazard Noul at or above this triggers its action (block / support / caution). */
  act: number;
  /** Severity score at or above this blocks when any hazard is at least in review. */
  severityBlock: number;
  humanMin: number;
  intentMinConfidence: number;
  faqTopicMinConfidence: number;
  faqMaxComplexity: number;
  complaintHumanComplexity: number;
  opusMinComplexity: number;
}

export const B1_POLICIES: Record<"strict" | "permissive", B1Thresholds> = {
  strict: { review: 0.35, act: 0.7, severityBlock: 2.0, humanMin: 0.8, intentMinConfidence: 0.5, faqTopicMinConfidence: 0.6, faqMaxComplexity: 0.7, complaintHumanComplexity: 1.0, opusMinComplexity: 1.5 },
  permissive: { review: 0.35, act: 0.85, severityBlock: 2.0, humanMin: 0.8, intentMinConfidence: 0.5, faqTopicMinConfidence: 0.6, faqMaxComplexity: 0.7, complaintHumanComplexity: 1.0, opusMinComplexity: 1.5 },
};
export type B1PolicyId = keyof typeof B1_POLICIES;
