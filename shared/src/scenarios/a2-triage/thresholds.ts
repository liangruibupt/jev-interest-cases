/** Every knob the A2 board exposes. Changing these re-routes tickets without new inference. */
export interface A2Thresholds {
  /** Below this department confidence the ticket goes to human review. */
  deptMinConfidence: number;
  /** Spam risk strictly between low and block → review. */
  spamReviewLow: number;
  /** Spam risk at or above this → quarantine. */
  spamBlock: number;
  refundYes: number;
  /** A second department with at least this probability gets a cc. */
  secondTeamMinProb: number;
  severityHigh: number;
  reproYes: number;
  openOrderYes: number;
  frustrationHigh: number;
}

export const A2_THRESHOLDS: A2Thresholds = {
  deptMinConfidence: 0.6,
  spamReviewLow: 0.4,
  spamBlock: 0.6,
  refundYes: 0.7,
  secondTeamMinProb: 0.25,
  severityHigh: 1.5,
  reproYes: 0.6,
  openOrderYes: 0.7,
  frustrationHigh: 1.5,
};

export type SpamWeights = { requests_credentials: number; sender_identity_mismatch: number; unexpected_reward: number };
export const A2_SPAM_WEIGHTS: SpamWeights = { requests_credentials: 0.45, sender_identity_mismatch: 0.3, unexpected_reward: 0.25 };

export const A2_SLIDERS: { key: keyof A2Thresholds; label_zh: string; min: number; max: number; step: number }[] = [
  { key: "deptMinConfidence", label_zh: "部门置信度门限（低于 → 人工复核）", min: 0, max: 1, step: 0.05 },
  { key: "spamReviewLow", label_zh: "垃圾风险灰区下限", min: 0, max: 1, step: 0.05 },
  { key: "spamBlock", label_zh: "垃圾风险隔离线", min: 0, max: 1, step: 0.05 },
  { key: "secondTeamMinProb", label_zh: "抄送第二部门的概率门限", min: 0, max: 1, step: 0.05 },
  { key: "refundYes", label_zh: "退款请求 Noul 门限", min: 0, max: 1, step: 0.05 },
  { key: "frustrationHigh", label_zh: "愤怒徽章的 Score 门限", min: 0, max: 2, step: 0.1 },
  { key: "severityHigh", label_zh: "阻塞徽章的 Score 门限", min: 0, max: 2, step: 0.1 },
];

export const A2_WEIGHT_SLIDERS: { key: keyof SpamWeights; label_zh: string }[] = [
  { key: "requests_credentials", label_zh: "权重：索要凭证" },
  { key: "sender_identity_mismatch", label_zh: "权重：发件人身份不符" },
  { key: "unexpected_reward", label_zh: "权重：意外奖励" },
];
