import type { VppNotice, VppSite } from "../../datasets/vppNotices";
import type { Questions } from "../../types";

export const C4_QUESTION_IDS = ["notice_type", "applies_region", "applies_asset", "names_site", "addressed_to_one_site", "requires_action", "is_test", "urgency", "alarm_category"] as const;
export const NOTICE_TYPES = ["dispatch_instruction", "demand_response_event", "curtailment", "test_event", "market_information", "maintenance", "settlement", "alarm", "customer_request", "registration", "other"] as const;
export const ALARM_CATEGORIES = ["telemetry", "communications", "hardware", "safety", "market", "not_an_alarm"] as const;

/** One request per (notice, site). Jev judges words; kW / MW, percentages and clock times are compared in code. */
export const C4_QUESTIONS: Questions = {
  notice_type: {
    type: "choice",
    instructions: "What kind of message is `notice`?",
    criteria: {
      dispatch_instruction: "Tells resources to charge, discharge, or run at a level",
      demand_response_event: "Calls or schedules a demand response event",
      curtailment: "Orders generation or output to be reduced",
      test_event: "A test or drill with no real response required",
      market_information: "Prices or market conditions, informational only",
      maintenance: "Planned maintenance of systems or portals",
      settlement: "Settlement statements, invoices, or payment information",
      alarm: "An automated alarm or fault report from equipment or monitoring",
      customer_request: "A message from a customer or site owner asking for something",
      registration: "Enrollment, re-registration, or program deadlines",
      other: "None of the above",
    },
  },
  applies_region: {
    type: "noul",
    instructions: "Does `notice` apply to sites located in `site.region`?",
    criteria: {
      true: "It names that zone, or it does not limit itself to any particular zone (a general notice applies everywhere)",
      false: "It limits itself to other zones only",
    },
  },
  applies_asset: {
    type: "noul",
    instructions: "Does `notice` apply to resources of the kind in `site.asset_type`?",
    criteria: {
      true: "It names that kind of resource (battery storage, solar, demand response load), or it does not limit itself to particular kinds of resource",
      false: "It limits itself to other kinds of resource, or explicitly excludes this kind",
    },
  },
  names_site: {
    type: "noul",
    instructions: "Does `notice` refer to `site.name` specifically (by name or an unmistakable reference)?",
  },
  addressed_to_one_site: {
    type: "noul",
    instructions: "Is `notice` addressed to one specific named site or asset, rather than to a zone or a class of resources?",
    criteria: { true: "It names a particular site, plant, gateway, or inverter as its subject", false: "It speaks to all resources of a zone or kind, or to all participants" },
  },
  requires_action: {
    type: "noul",
    instructions: "Does `notice` require the operator of the site to do something (dispatch, curtail, respond, confirm, re-register, exclude), rather than only informing them?",
  },
  is_test: {
    type: "noul",
    instructions: "Is `notice` a test or drill with no real response required?",
  },
  urgency: {
    type: "score",
    instructions: "How soon does `notice` need attention from the site operator?",
    criteria: ["Informational, no deadline", "Action needed within days", "Action needed now or within hours"],
  },
  alarm_category: {
    type: "choice",
    instructions: "If `notice` is an alarm or fault report, what kind?",
    criteria: {
      telemetry: "Sensor readings missing, stale, or implausible",
      communications: "Lost connection, heartbeat, or gateway offline",
      hardware: "Equipment fault or failure",
      safety: "Fire, smoke, flooding, or other danger to people or equipment",
      market: "Market or settlement anomaly",
      not_an_alarm: "The notice is not an alarm",
    },
  },
};

export const C4_NOT_ASKED: { question: string; why_zh: string }[] = [
  { question: "Should we discharge the battery now?", why_zh: "调度决策取决于电价、SOC、预测与合约，是优化问题；Jev 只判断通知是否适用、是否要求行动。" },
  { question: "What price should we bid?", why_zh: "报价是数字与模型。" },
  { question: "Is 800 kW enough for this event?", why_zh: "容量阈值由代码从通知里解析并与站点档案比较；Jev 不比较数字。" },
  { question: "Will the event be called tomorrow?", why_zh: "预测不是判断。" },
];

export function buildPairState(n: VppNotice, s: VppSite): { notice: string; from: string; site: { name: string; region: string; asset_type: string } } {
  return { notice: n.text, from: n.from, site: { name: s.name, region: s.region, asset_type: s.asset_type } };
}
