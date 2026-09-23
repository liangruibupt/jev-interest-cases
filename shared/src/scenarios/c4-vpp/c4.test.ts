import { describe, expect, it } from "vitest";
import { VPP_NOTICES, VPP_SITES } from "../../datasets/vppNotices";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { ALARM_CATEGORIES, C4_NOT_ASKED, C4_QUESTIONS, C4_QUESTION_IDS, C4_THRESHOLDS, NOTICE_TYPES, applyNotice, buildPairState, parseConstraints } from "./index";

type Over = Partial<{ type: string; region: number; asset: number; names: number; action: number; test: number; urgency: number; alarm: string; alarmConf: number }>;
function answers(o: Over = {}): Answers {
  const v = { type: "market_information", region: 0.95, asset: 0.95, names: 0.05, action: 0.1, test: 0.02, urgency: 0.3, alarm: "not_an_alarm", alarmConf: 0.95, ...o };
  return {
    notice_type: { type: "choice", choice: v.type, probabilities: { [v.type]: 1 }, confidence: 0.9 },
    applies_region: { type: "noul", noul: v.region },
    applies_asset: { type: "noul", noul: v.asset },
    names_site: { type: "noul", noul: v.names },
    requires_action: { type: "noul", noul: v.action },
    is_test: { type: "noul", noul: v.test },
    urgency: { type: "score", score: v.urgency, probabilities: { "0": 0, "1": 0, "2": 0, [String(Math.round(v.urgency))]: 1 }, legend: {}, confidence: 0.9 },
    alarm_category: { type: "choice", choice: v.alarm, probabilities: { [v.alarm]: 1 }, confidence: v.alarmConf },
  };
}
const S1 = VPP_SITES[0]!;
const S2 = VPP_SITES[1]!;
const N02 = VPP_NOTICES[1]!;
const N04 = VPP_NOTICES[3]!;

describe("C4 dataset and questions", () => {
  it("has 3 sites, 12 notices labelled for every site, and 8 valid questions", () => {
    expect(VPP_SITES).toHaveLength(3);
    expect(VPP_NOTICES).toHaveLength(12);
    expect(VPP_NOTICES.every((n) => VPP_SITES.every((s) => (n.expected[s.id]?.length ?? 0) > 0))).toBe(true);
    expect(validateQuestions(C4_QUESTIONS)).toEqual([]);
    expect(Object.keys(C4_QUESTIONS)).toEqual([...C4_QUESTION_IDS]);
    const nt = C4_QUESTIONS.notice_type!;
    if (nt.type !== "choice") throw new Error("notice_type must be a choice");
    expect(Object.keys(nt.criteria)).toEqual([...NOTICE_TYPES]);
    const ac = C4_QUESTIONS.alarm_category!;
    if (ac.type !== "choice") throw new Error("alarm_category must be a choice");
    expect(Object.keys(ac.criteria)).toEqual([...ALARM_CATEGORIES]);
    expect(C4_NOT_ASKED.length).toBeGreaterThanOrEqual(3);
    expect(buildPairState(N04, S1)).toEqual({ notice: N04.text, from: "grid_operator", site: { name: S1.name, region: "North Zone", asset_type: "battery_storage" } });
  });
});

describe("C4 constraints parsed in code", () => {
  it("compares capacity thresholds with the site and extracts percentages, windows and deadlines", () => {
    const c1 = parseConstraints(N02.text, S1);
    expect(c1.find((c) => c.kind === "min_capacity_kw")).toMatchObject({ value: 1000, satisfied: true });
    expect(parseConstraints(N02.text, S2).find((c) => c.kind === "min_capacity_kw")).toMatchObject({ value: 1000, satisfied: false });
    expect(parseConstraints("resources with a minimum of 500 kW", S2).find((c) => c.kind === "min_capacity_kw")).toMatchObject({ value: 500, satisfied: true });
    expect(parseConstraints(VPP_NOTICES[2]!.text, S2).map((c) => c.kind)).toEqual(["curtail_percent", "time_window"]);
    expect(parseConstraints(VPP_NOTICES[2]!.text, S2).find((c) => c.kind === "curtail_percent")?.value).toBe(50);
    expect(parseConstraints(VPP_NOTICES[0]!.text, S1).find((c) => c.kind === "time_window")?.text).toBe("16:00–19:00");
    expect(parseConstraints(VPP_NOTICES[0]!.text, S1).find((c) => c.kind === "deadline")?.text).toBe("12:00 tomorrow");
    expect(parseConstraints("Nothing numeric here.", S1)).toEqual([]);
  });
});

describe("C4 applyNotice", () => {
  const t = C4_THRESHOLDS;
  it("code-parsed capacity thresholds exclude a site before any Jev answer, unless the notice names the site", () => {
    expect(applyNotice(answers({ type: "test_event", test: 0.95 }), N02, S2, t)).toMatchObject({ route: "not_applicable", ruleId: "capacity" });
    expect(applyNotice(answers({ type: "test_event", test: 0.95 }), N02, S1, t)).toMatchObject({ route: "acknowledge_test", ruleId: "test" });
    expect(applyNotice(answers({ names: 0.9, type: "alarm", alarm: "telemetry" }), N02, S2, t).route).toBe("alarm"); // named site wins
  });
  it("alarms and customer requests are judged by the site name alone", () => {
    expect(applyNotice(answers({ type: "alarm", alarm: "communications", names: 0.5, region: 0.4, asset: 0.8 }), N04, S1, t)).toMatchObject({ route: "alarm" });
    expect(applyNotice(answers({ type: "alarm", alarm: "communications", names: 0.49, region: 0.4, asset: 0.8 }), N04, S1, t)).toMatchObject({ route: "review", ruleId: "review_site" });
    expect(applyNotice(answers({ type: "alarm", alarm: "communications", names: 0.34, region: 0.9, asset: 0.9 }), N04, S1, t)).toMatchObject({ route: "not_applicable", ruleId: "not_named" });
    expect(applyNotice(answers({ type: "customer_request", names: 0.6, region: 0.5, asset: 0.9, action: 0.9, urgency: 1.6 }), N04, S1, t)).toMatchObject({ route: "act_now" });
    expect(applyNotice(answers({ type: "customer_request", names: 0.1, region: 0.9, asset: 0.9, action: 0.9 }), N04, S1, t).route).toBe("not_applicable");
  });
  it("applicability bands: not applicable below review, review in the grey band, names_site overrides", () => {
    expect(applyNotice(answers({ region: 0.34 }), N04, S1, t).route).toBe("not_applicable");
    expect(applyNotice(answers({ region: 0.35 }), N04, S1, t)).toMatchObject({ route: "review", ruleId: "review" });
    expect(applyNotice(answers({ asset: 0.69 }), N04, S1, t).route).toBe("review");
    expect(applyNotice(answers({ region: 0.1, asset: 0.1, names: 0.7 }), N04, S1, t).route).toBe("info");
  });
  it("test, alarm, action and info in that order; urgency splits act_now from schedule", () => {
    expect(applyNotice(answers({ test: 0.7, action: 0.95, urgency: 2 }), N04, S1, t).route).toBe("acknowledge_test");
    expect(applyNotice(answers({ alarm: "communications", alarmConf: 0.7, action: 0.95, urgency: 2, names: 0.9 }), N04, S1, t)).toMatchObject({ route: "alarm" });
    expect(applyNotice(answers({ alarm: "communications", alarmConf: 0.69, type: "alarm", names: 0.9 }), N04, S1, t).route).toBe("alarm"); // notice_type says alarm
    expect(applyNotice(answers({ action: 0.7, urgency: 1.5 }), N04, S1, t)).toMatchObject({ route: "act_now" });
    expect(applyNotice(answers({ action: 0.7, urgency: 1.49 }), N04, S1, t)).toMatchObject({ route: "schedule" });
    expect(applyNotice(answers({ action: 0.69, urgency: 2 }), N04, S1, t)).toMatchObject({ route: "info" });
  });
});
