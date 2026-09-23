import type { ClaudeTierId } from "../../pricing";
import type { Answers } from "../../types";
import type { FaqTopic } from "./faq";
import type { B1QuestionId } from "./questions";
import { B1_POLICIES, type B1Thresholds } from "./thresholds";

export { B1_POLICIES };

export const B1_ROUTES = ["support", "block", "human", "deterministic", "sonnet", "sonnet_caution", "opus"] as const;
export type B1Route = (typeof B1_ROUTES)[number];

export const ROUTE_LABELS_ZH: Record<B1Route, string> = {
  support: "固定支持回复",
  block: "已拦截",
  human: "转人工",
  deterministic: "FAQ 直答（无模型）",
  sonnet: "Claude Sonnet 5",
  sonnet_caution: "Claude Sonnet 5 · 医疗谨慎",
  opus: "Claude Opus 5",
};

export interface B1Rule {
  id: string;
  zh: string;
}

/** The ordered rule list, exported so the UI can render it with the fired rule highlighted. */
export const B1_RULES: B1Rule[] = [
  { id: "self_harm", zh: "自伤信号 ≥ act → 固定支持资源，不调用 LLM" },
  { id: "jailbreak_or_harmful", zh: "越狱或有害请求 ≥ act → 拦截" },
  { id: "severity", zh: "严重度 ≥ severityBlock 且任一危害 ≥ review → 拦截" },
  { id: "wants_human", zh: "明确要求真人 ≥ humanMin → 转人工" },
  { id: "intent_unclear", zh: "意图置信度 < intentMinConfidence → 转人工" },
  { id: "medical", zh: "医疗剂量/诊断 ≥ act → Sonnet 5 + 医疗谨慎提示" },
  { id: "faq", zh: "意图 = FAQ 且复杂度低且话题置信 ≥ 门限 → FAQ 直答" },
  { id: "complaint_human", zh: "投诉且复杂度 ≥ 门限 → 转人工" },
  { id: "complex", zh: "复杂度 ≥ opusMinComplexity → Claude Opus 5" },
  { id: "default", zh: "其余 → Claude Sonnet 5" },
];

export interface B1Decision {
  route: B1Route;
  tier?: ClaudeTierId;
  ruleId: string;
  rule_zh: string;
  reasons: string[];
  faqTopic?: FaqTopic;
  hazards: { jailbreak: number; harmful: number; medical: number; selfHarm: number; severity: number };
}

const noul = (a: Answers, id: B1QuestionId) => {
  const x = a[id];
  return x && x.type === "noul" ? x.noul : 0;
};
const score = (a: Answers, id: B1QuestionId) => {
  const x = a[id];
  return x && x.type === "score" ? x.score : 0;
};
const choice = (a: Answers, id: B1QuestionId) => {
  const x = a[id];
  return x && x.type === "choice" ? { value: x.choice, confidence: x.confidence ?? 0 } : { value: "other", confidence: 0 };
};

/** Pure, ordered first-match routing. Never calls the network. */
export function decide(answers: Answers, t: B1Thresholds = B1_POLICIES.strict): B1Decision {
  const hazards = {
    jailbreak: noul(answers, "jailbreak"),
    harmful: noul(answers, "harmful_request"),
    medical: noul(answers, "medical_advice"),
    selfHarm: noul(answers, "self_harm"),
    severity: score(answers, "severity"),
  };
  const intent = choice(answers, "intent");
  const topic = choice(answers, "faq_topic");
  const complexity = score(answers, "complexity");
  const wantsHuman = noul(answers, "wants_human");
  const f = (n: number) => n.toFixed(2);
  const rule = (id: string) => B1_RULES.find((r) => r.id === id)!;
  const base = (id: string, route: B1Route, reasons: string[], extra: Partial<B1Decision> = {}): B1Decision => ({ route, ruleId: id, rule_zh: rule(id).zh, reasons, hazards, ...extra });

  if (hazards.selfHarm >= t.act) return base("self_harm", "support", [`self_harm ${f(hazards.selfHarm)} ≥ ${t.act}`]);
  if (hazards.jailbreak >= t.act || hazards.harmful >= t.act) {
    return base("jailbreak_or_harmful", "block", [`jailbreak ${f(hazards.jailbreak)} / harmful ${f(hazards.harmful)}，门限 ${t.act}`]);
  }
  const anyReview = Math.max(hazards.jailbreak, hazards.harmful, hazards.medical, hazards.selfHarm) >= t.review;
  if (hazards.severity >= t.severityBlock && anyReview) {
    return base("severity", "block", [`severity ${f(hazards.severity)} ≥ ${t.severityBlock} 且有危害信号 ≥ ${t.review}`]);
  }
  if (wantsHuman >= t.humanMin) return base("wants_human", "human", [`wants_human ${f(wantsHuman)} ≥ ${t.humanMin}`]);
  if (intent.confidence < t.intentMinConfidence) return base("intent_unclear", "human", [`intent=${intent.value} 置信度 ${f(intent.confidence)} < ${t.intentMinConfidence}`]);
  if (hazards.medical >= t.act) return base("medical", "sonnet_caution", [`medical_advice ${f(hazards.medical)} ≥ ${t.act}`], { tier: "standard" });
  if (intent.value === "faq" && complexity <= t.faqMaxComplexity && topic.value !== "none" && topic.confidence >= t.faqTopicMinConfidence) {
    return base("faq", "deterministic", [`intent=faq，topic=${topic.value}（置信 ${f(topic.confidence)}），complexity ${f(complexity)} ≤ ${t.faqMaxComplexity}`], { faqTopic: topic.value as FaqTopic });
  }
  if (intent.value === "complaint" && complexity >= t.complaintHumanComplexity) {
    return base("complaint_human", "human", [`intent=complaint 且 complexity ${f(complexity)} ≥ ${t.complaintHumanComplexity}`]);
  }
  if (complexity >= t.opusMinComplexity) return base("complex", "opus", [`complexity ${f(complexity)} ≥ ${t.opusMinComplexity}`], { tier: "strong" });
  return base("default", "sonnet", [`intent=${intent.value}（置信 ${f(intent.confidence)}），complexity ${f(complexity)}`], { tier: "standard" });
}
