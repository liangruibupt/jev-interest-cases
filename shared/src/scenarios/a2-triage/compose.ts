import type { Lane } from "../../datasets/tickets";
import type { Answers } from "../../types";
import type { A2QuestionId } from "./questions";
import { A2_SPAM_WEIGHTS, A2_THRESHOLDS, type A2Thresholds, type SpamWeights } from "./thresholds";

export { A2_SPAM_WEIGHTS, A2_THRESHOLDS };

export type Badge = "refund" | "repro" | "open_order" | "angry" | "blocking";
export type Team = "billing" | "orders" | "account" | "technical";

export interface Decision {
  lane: Lane;
  /** 0..1, used to sort cards inside a lane. */
  priority: number;
  spamRisk: number;
  badges: Badge[];
  ccTeams: Team[];
  /** Chinese explanations of every rule that fired. */
  reasons: string[];
  /** Which of the 10 speculative answers this decision actually consumed. */
  usedQuestionIds: A2QuestionId[];
}

export const LANE_LABELS_ZH: Record<Lane, string> = {
  billing: "账单",
  orders: "订单",
  account: "账户",
  technical: "技术",
  review: "人工复核",
  quarantine: "隔离",
};

export const BADGE_LABELS_ZH: Record<Badge, string> = {
  refund: "退款",
  repro: "可复现",
  open_order: "未完成订单",
  angry: "愤怒",
  blocking: "阻塞",
};

const TEAMS: Team[] = ["billing", "orders", "account", "technical"];

function noul(answers: Answers, id: A2QuestionId): number {
  const a = answers[id];
  return a && a.type === "noul" ? a.noul : 0;
}
function score(answers: Answers, id: A2QuestionId): number {
  const a = answers[id];
  return a && a.type === "score" ? a.score : 0;
}

/** Pure, deterministic routing over one ticket's answers. Never calls the network. */
export function compose(answers: Answers, thresholds: A2Thresholds = A2_THRESHOLDS, weights: SpamWeights = A2_SPAM_WEIGHTS): Decision {
  const reasons: string[] = [];
  const used = new Set<A2QuestionId>(["department", "frustration", "requests_credentials", "sender_identity_mismatch", "unexpected_reward"]);

  const spamRisk =
    weights.requests_credentials * noul(answers, "requests_credentials") +
    weights.sender_identity_mismatch * noul(answers, "sender_identity_mismatch") +
    weights.unexpected_reward * noul(answers, "unexpected_reward");

  const dept = answers.department;
  const deptChoice = dept && dept.type === "choice" ? dept.choice : "other";
  const deptConf = dept && dept.type === "choice" ? (dept.confidence ?? 0) : 0;
  const deptProbs = dept && dept.type === "choice" ? dept.probabilities : {};

  let lane: Lane;
  if (spamRisk >= thresholds.spamBlock) {
    lane = "quarantine";
    reasons.push(`垃圾风险 ${spamRisk.toFixed(2)} ≥ 隔离线 ${thresholds.spamBlock}`);
  } else if (spamRisk > thresholds.spamReviewLow) {
    lane = "review";
    reasons.push(`垃圾风险 ${spamRisk.toFixed(2)} 落在灰区 (${thresholds.spamReviewLow}, ${thresholds.spamBlock})`);
  } else if (deptChoice === "other") {
    lane = "review";
    reasons.push("部门判为 other：不属于任何已知团队");
  } else if (deptConf < thresholds.deptMinConfidence) {
    lane = "review";
    reasons.push(`部门置信度 ${deptConf.toFixed(2)} < 门限 ${thresholds.deptMinConfidence}`);
  } else {
    lane = deptChoice as Lane;
    reasons.push(`部门 ${deptChoice}（概率 ${(deptProbs[deptChoice] ?? 0).toFixed(2)}，置信度 ${deptConf.toFixed(2)}）`);
  }

  const ccTeams = TEAMS.filter((t) => t !== deptChoice && (deptProbs[t] ?? 0) >= thresholds.secondTeamMinProb);
  if (ccTeams.length) reasons.push(`抄送 ${ccTeams.join(", ")}（概率 ≥ ${thresholds.secondTeamMinProb}）`);

  const frustration = score(answers, "frustration");
  const severity = score(answers, "bug_severity");
  const isTech = lane === "technical";
  const priority = Math.round((0.5 * (frustration / 2) + 0.5 * (isTech ? severity / 2 : 0)) * 100) / 100;

  const badges: Badge[] = [];
  if (lane === "billing" || lane === "orders" || lane === "review") {
    used.add("refund_requested");
    if (noul(answers, "refund_requested") >= thresholds.refundYes) badges.push("refund");
  }
  if (lane === "billing" || lane === "orders") used.add("requested_resolution");
  if (isTech) {
    used.add("bug_severity");
    used.add("has_repro_steps");
    if (noul(answers, "has_repro_steps") >= thresholds.reproYes) badges.push("repro");
    if (severity >= thresholds.severityHigh) badges.push("blocking");
  }
  if (lane === "orders") {
    used.add("mentions_open_order");
    if (noul(answers, "mentions_open_order") >= thresholds.openOrderYes) badges.push("open_order");
  }
  if (frustration >= thresholds.frustrationHigh) badges.push("angry");
  if (badges.length) reasons.push(`徽章：${badges.map((b) => BADGE_LABELS_ZH[b]).join(" / ")}`);

  return { lane, priority, spamRisk, badges, ccTeams, reasons, usedQuestionIds: [...used] };
}
