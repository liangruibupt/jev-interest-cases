import type { EventType, ReadingLane } from "../../datasets/filings";
import type { Answers } from "../../types";
import { extractAmounts, type MoneyMention } from "./numbers";
import { EVENT_TYPES } from "./questions";
import { C3_THRESHOLDS, type C3Thresholds } from "./thresholds";

export interface FilingJudgment {
  lane: ReadingLane;
  ruleId: string;
  rule_zh: string;
  materiality: number;
  materialityConfidence: number | null;
  materialityProbabilities: Record<string, number>;
  event: { choice: EventType; confidence: number; probabilities: Record<string, number> } | null;
  direction: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  flags: string[];
  signals: { forwardLooking: number; hedged: number; accounting: number; keyPerson: number; boilerplate: number };
  amounts: MoneyMention[];
}

export const READING_LANE_LABELS_ZH: Record<ReadingLane, string> = { read_now: "立即看", today: "今日看", archive: "归档" };
export const EVENT_LABELS_ZH: Record<EventType, string> = {
  guidance_change: "指引变更", executive_change: "高管变动", restatement_or_accounting: "重述 / 会计", going_concern_or_liquidity: "持续经营 / 流动性",
  m_and_a: "并购", major_customer_or_contract: "重大客户 / 合同", litigation_or_regulatory: "诉讼 / 监管", cyber_incident: "网络安全事件",
  capital_return: "分红 / 回购", product_or_operations: "产品 / 经营", insider_transaction: "内部人交易", routine_housekeeping: "常规事务", other: "其它",
};
export const DIRECTION_LABELS_ZH: Record<string, string> = { negative: "负面", neutral: "中性", positive: "正面", mixed: "混合" };
export const FLAG_LABELS_ZH: Record<string, string> = { accounting: "会计 / 内控", key_person: "关键人物", hedged: "措辞含糊", forward_looking: "前瞻性", boilerplate: "套话" };

/** Ordered first-match: accounting issues and the top materiality band always surface first; boilerplate sinks. */
export function judgeFiling(answers: Answers, text: string, t: C3Thresholds = C3_THRESHOLDS): FilingJudgment {
  const noul = (id: string): number => {
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };
  const m = answers.materiality;
  const materiality = m && m.type === "score" ? m.score : 0;
  const materialityConfidence = m && m.type === "score" ? m.confidence : null;
  const materialityProbabilities = m && m.type === "score" ? m.probabilities : {};
  const e = answers.event_type;
  const event = e && e.type === "choice" && EVENT_TYPES.includes(e.choice as EventType) ? { choice: e.choice as EventType, confidence: e.confidence ?? 0, probabilities: e.probabilities } : null;
  const d = answers.direction;
  const direction = d && d.type === "choice" ? { choice: d.choice, confidence: d.confidence ?? 0, probabilities: d.probabilities } : null;
  const signals = { forwardLooking: noul("is_forward_looking"), hedged: noul("hedged_language"), accounting: noul("accounting_or_controls"), keyPerson: noul("key_person"), boilerplate: noul("boilerplate") };
  const flags: string[] = [];
  if (signals.accounting >= t.flag) flags.push("accounting");
  if (signals.keyPerson >= t.flag) flags.push("key_person");
  if (signals.hedged >= t.hedged) flags.push("hedged");
  if (signals.forwardLooking >= t.flag) flags.push("forward_looking");
  if (signals.boilerplate >= t.boilerplate) flags.push("boilerplate");
  const base = { materiality, materialityConfidence, materialityProbabilities, event, direction, flags, signals, amounts: extractAmounts(text) };
  const decide = (lane: ReadingLane, ruleId: string, rule_zh: string): FilingJudgment => ({ lane, ruleId, rule_zh, ...base });

  if (signals.accounting >= t.flag) return decide("read_now", "accounting", `accounting_or_controls ${signals.accounting.toFixed(2)} ≥ ${t.flag} → 立即看（会计问题永远先看）`);
  if (materiality >= t.readNow) return decide("read_now", "materiality_high", `materiality ${materiality.toFixed(2)} ≥ ${t.readNow} → 立即看`);
  if (signals.keyPerson >= t.flag && direction?.choice === "negative") return decide("read_now", "key_person_negative", `key_person ${signals.keyPerson.toFixed(2)} ≥ ${t.flag} 且方向为负面 → 立即看`);
  if (signals.boilerplate >= t.boilerplate && materiality < t.today) return decide("archive", "boilerplate", `boilerplate ${signals.boilerplate.toFixed(2)} ≥ ${t.boilerplate} 且 materiality ${materiality.toFixed(2)} < ${t.today} → 归档`);
  if (materiality >= t.today) return decide("today", "materiality_mid", `materiality ${materiality.toFixed(2)} ≥ ${t.today} → 今日看`);
  if (signals.hedged >= t.hedged && materiality >= t.hedgedMateriality) return decide("today", "hedged", `hedged_language ${signals.hedged.toFixed(2)} ≥ ${t.hedged} 且 materiality ≥ ${t.hedgedMateriality} → 今日看（含糊措辞值得一读）`);
  return decide("archive", "low", `materiality ${materiality.toFixed(2)} < ${t.today} → 归档`);
}
