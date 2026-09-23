import type { C4Route, VppNotice, VppSite } from "../../datasets/vppNotices";
import type { Answers } from "../../types";
import { parseConstraints, type Constraint } from "./constraints";
import { ALARM_CATEGORIES, NOTICE_TYPES } from "./questions";
import { C4_THRESHOLDS, type C4Thresholds } from "./thresholds";

export interface PairDecision {
  route: C4Route;
  ruleId: string;
  rule_zh: string;
  reasons: string[];
  /** How strongly the notice applies: names_site when it fires, else min(applies_region, applies_asset). */
  applies: number;
  appliesRegion: number;
  appliesAsset: number;
  namesSite: number;
  addressedToOneSite: number;
  requiresAction: number;
  isTest: number;
  urgency: number;
  noticeType: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  alarmCategory: { choice: string; confidence: number } | null;
  constraints: Constraint[];
}

export const C4_ROUTE_LABELS_ZH: Record<C4Route, string> = {
  act_now: "立即行动",
  schedule: "排期",
  info: "仅告知",
  acknowledge_test: "测试 · 确认收到",
  alarm: "告警",
  not_applicable: "不适用",
  review: "复核",
};
export const NOTICE_TYPE_LABELS_ZH: Record<string, string> = {
  dispatch_instruction: "调度指令", demand_response_event: "需求响应事件", curtailment: "限出力", test_event: "测试事件", market_information: "市场信息",
  maintenance: "维护", settlement: "结算", alarm: "告警", customer_request: "客户请求", registration: "注册 / 注销", other: "其它",
};
export const ALARM_LABELS_ZH: Record<string, string> = { telemetry: "遥测", communications: "通信", hardware: "硬件", safety: "安全", market: "市场", not_an_alarm: "非告警" };

/** Ordered first-match per (notice, site). Code-parsed capacity thresholds decide before any Jev answer. */
export function applyNotice(answers: Answers, notice: VppNotice, site: VppSite, t: C4Thresholds = C4_THRESHOLDS): PairDecision {
  const noul = (id: string): number => {
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };
  const nt = answers.notice_type;
  const noticeType = nt && nt.type === "choice" && (NOTICE_TYPES as readonly string[]).includes(nt.choice) ? { choice: nt.choice, confidence: nt.confidence ?? 0, probabilities: nt.probabilities } : null;
  const ac = answers.alarm_category;
  const alarmCategory = ac && ac.type === "choice" && (ALARM_CATEGORIES as readonly string[]).includes(ac.choice) ? { choice: ac.choice, confidence: ac.confidence ?? 0 } : null;
  const u = answers.urgency;
  const urgency = u && u.type === "score" ? u.score : 0;
  const appliesRegion = noul("applies_region");
  const appliesAsset = noul("applies_asset");
  const namesSite = noul("names_site");
  const requiresAction = noul("requires_action");
  const isTest = noul("is_test");
  const addressedToOneSite = noul("addressed_to_one_site");
  const constraints = parseConstraints(notice.text, site);
  // Alarms and customer requests concern one site: only the site name decides, zone and asset words do not.
  const siteSpecific = noticeType?.choice === "alarm" || noticeType?.choice === "customer_request" || (alarmCategory !== null && alarmCategory.choice !== "not_an_alarm" && alarmCategory.confidence >= t.act);
  const namedThreshold = siteSpecific ? t.namesSiteMin : t.act;
  const applies = namesSite >= namedThreshold ? namesSite : Math.min(appliesRegion, appliesAsset);
  const base = { applies, appliesRegion, appliesAsset, namesSite, addressedToOneSite, requiresAction, isTest, urgency, noticeType, alarmCategory, constraints };
  const decide = (route: C4Route, ruleId: string, rule_zh: string, reasons: string[]): PairDecision => ({ route, ruleId, rule_zh, reasons, ...base });

  // Capacity thresholds gate class-wide notices only; a notice that names this site is never capacity-gated.
  const unmet = constraints.find((c) => c.kind === "min_capacity_kw" && c.satisfied === false);
  if (unmet && !siteSpecific && namesSite < t.act) return decide("not_applicable", "capacity", `代码比较：站点 ${site.capacity_kw} kW 不满足 "${unmet.text}" → 不适用`, [`min_capacity_kw ${unmet.value} > ${site.capacity_kw}`]);
  // A notice addressed to one particular site that is not this one does not leak to same-zone, same-kind neighbours.
  if (addressedToOneSite >= t.act && namesSite < t.review) return decide("not_applicable", "other_site", `addressed_to_one_site ${addressedToOneSite.toFixed(2)} ≥ ${t.act} 且 names_site ${namesSite.toFixed(2)} < ${t.review} → 点名的是别的站点，不适用`, []);
  let named = namesSite >= t.act;
  if (siteSpecific && !named) {
    if (namesSite >= t.namesSiteMin) named = true;
    else if (namesSite >= t.review) return decide("review", "review_site", `点名类通知（${noticeType?.choice ?? "alarm"}）：names_site ${namesSite.toFixed(2)} 落在 ${t.review}–${t.namesSiteMin} → 复核`, []);
    else return decide("not_applicable", "not_named", `点名类通知（${noticeType?.choice ?? "alarm"}）但 names_site ${namesSite.toFixed(2)} < ${t.review} → 不适用`, []);
  }
  if (!named) {
    if (appliesRegion < t.review || appliesAsset < t.review) return decide("not_applicable", "not_applicable", `applies_region ${appliesRegion.toFixed(2)} / applies_asset ${appliesAsset.toFixed(2)}：至少一项 < ${t.review} → 不适用`, []);
    if (appliesRegion < t.act || appliesAsset < t.act) return decide("review", "review", `适用性落在 ${t.review}–${t.act} 灰区 → 复核`, [`applies_region ${appliesRegion.toFixed(2)}`, `applies_asset ${appliesAsset.toFixed(2)}`]);
  }
  const how = named ? `names_site ${namesSite.toFixed(2)} ≥ ${namedThreshold}` : `applies_region ${appliesRegion.toFixed(2)} 且 applies_asset ${appliesAsset.toFixed(2)} ≥ ${t.act}`;
  if (isTest >= t.act) return decide("acknowledge_test", "test", `${how}；is_test ${isTest.toFixed(2)} ≥ ${t.act} → 测试，确认收到即可`, []);
  const isAlarm = (alarmCategory && alarmCategory.choice !== "not_an_alarm" && alarmCategory.confidence >= t.act) || noticeType?.choice === "alarm";
  if (isAlarm) return decide("alarm", "alarm", `${how}；告警（${alarmCategory?.choice ?? "alarm"}）→ 告警队列`, [`alarm_category ${alarmCategory?.choice ?? "?"} ${(alarmCategory?.confidence ?? 0).toFixed(2)}`]);
  if (requiresAction >= t.act) {
    return urgency >= t.urgencyNow
      ? decide("act_now", "act_now", `${how}；requires_action ${requiresAction.toFixed(2)} ≥ ${t.act}，urgency ${urgency.toFixed(2)} ≥ ${t.urgencyNow} → 立即行动`, [])
      : decide("schedule", "schedule", `${how}；requires_action ${requiresAction.toFixed(2)} ≥ ${t.act}，urgency ${urgency.toFixed(2)} < ${t.urgencyNow} → 排期`, []);
  }
  return decide("info", "info", `${how}；requires_action ${requiresAction.toFixed(2)} < ${t.act} → 仅告知`, []);
}
