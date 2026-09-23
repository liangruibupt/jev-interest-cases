import { TICKETS } from "../../datasets/tickets";
import type { EntryType, Questions } from "../../types";
import { A2_QUESTIONS } from "../a2-triage/questions";
import { buildTicketState } from "../a2-triage/state";

export type A4CaseId = "moderation" | "ticket";

export interface A4Case {
  id: A4CaseId;
  title_zh: string;
  description_zh: string;
  state: EntryType;
  questions: Questions;
}

/** Borderline moderation post (our own text) with eight Choice questions, modelled on the official consistency cookbook. */
const MODERATION_STATE = {
  post: {
    id: "P-88213",
    community: "r/gamedebates",
    author: "frostbyte_77",
    text: "lol @nova_knight you got carried all season and everyone knows it. keep crying about the patch, nobody wants you in ranked anyway. real players are moving to our server, link in bio: discord.gg/xk9-ranked. see you never",
    author_history: { prior_strikes: 1, account_age_days: 412 },
    reports: 4,
    report_reasons: ["harassment", "spam link", "toxicity", "harassment"],
  },
};

const MODERATION_QUESTIONS: Questions = {
  category: {
    type: "choice",
    instructions: "What is the single most applicable content-policy category for `post.text`?",
    criteria: {
      none: "No policy category applies",
      harassment: "Targets, demeans, or bullies a specific person",
      hate: "Attacks people based on a protected characteristic",
      violence: "Threatens or encourages physical harm",
      spam: "Unsolicited promotion or link-farming",
      sexual: "Sexual content",
    },
  },
  primary_risk: {
    type: "choice",
    instructions: "What is the primary moderation risk that should drive triage for this post?",
    criteria: {
      harassment: "Harm to the targeted user",
      violence: "Risk of physical harm",
      link_abuse: "The external link is being used to pull users off-platform or brigade",
      account_history: "The author's prior strike makes repeat behaviour the main concern",
      low_risk: "Nothing here needs triage",
    },
  },
  target: {
    type: "choice",
    instructions: "Who is the target of the hostile content in `post.text`, if any?",
    criteria: { individual: "A specific named user", group: "A group of people", platform: "The community or platform itself", none: "No one is targeted" },
  },
  action: {
    type: "choice",
    instructions: "What enforcement action should be taken on this post?",
    criteria: {
      allow: "Leave it up",
      warn: "Leave it up and warn the author",
      remove: "Remove the post without further penalty",
      strike: "Remove the post and add a strike to the account",
      escalate: "Send to a senior moderator before acting",
    },
  },
  queue: {
    type: "choice",
    instructions: "Which review queue should receive this post?",
    criteria: { none: "No review needed", standard: "Normal moderation queue", priority: "Expedited queue", legal: "Legal or trust-and-safety specialists" },
  },
  link_handling: {
    type: "choice",
    instructions: "How should the link in `post.text` be handled?",
    criteria: {
      keep: "Leave the link as is",
      remove_link: "Strip the link but keep the post",
      warn_user: "Keep the link and warn the author about off-platform promotion",
      treat_as_brigading: "Treat the link as an attempt to organise brigading",
    },
  },
  review_path: {
    type: "choice",
    instructions: "Who should confirm the decision on this post?",
    criteria: { automated: "Automated action is fine", human_reviewer: "A regular human moderator", senior_reviewer: "A senior moderator or specialist" },
  },
  severity: {
    type: "choice",
    instructions: "How severe is the policy violation in `post.text`?",
    criteria: { none: "No violation", low: "Minor incivility", medium: "Clear violation without safety risk", high: "Serious violation or safety risk" },
  },
};

const TICKET_QUESTION_IDS = ["department", "requested_resolution", "bug_severity", "refund_requested", "mentions_open_order", "frustration"] as const;
const t23 = TICKETS.find((t) => t.id === "T23")!;

export const A4_CASES: A4Case[] = [
  {
    id: "moderation",
    title_zh: "边界审核帖（8 个 Choice）",
    description_zh: "一条游戏论坛帖：针对个人的嘲讽 + 外部 Discord 链接 + 作者有 1 次前科、4 次举报。八个问题都在'可辩护的多个答案'之间，是测稳定性的好样本。",
    state: MODERATION_STATE,
    questions: MODERATION_QUESTIONS,
  },
  {
    id: "ticket",
    title_zh: "歧义工单 T23（Choice / Score / Noul 混合）",
    description_zh: "A2 里跨三个部门的工单：迟到 + 尺码错 + 双重扣款。六个问题来自 A2 的问题集，覆盖三种原语。",
    state: buildTicketState(t23),
    questions: Object.fromEntries(TICKET_QUESTION_IDS.map((id) => [id, A2_QUESTIONS[id]])),
  },
];
