import { describe, expect, it } from "vitest";
import { PATIENT_MESSAGES } from "../../datasets/patientMessages";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { C2_NOT_ASKED, C2_QUESTIONS, C2_QUESTION_IDS, C2_THRESHOLDS, DEPARTMENTS, LANE_PRIORITY, buildPatientState, extractVitals, triage } from "./index";

type Over = Partial<{ urgency: number; urgencyConf: number; dep: string; depConf: number; chest: number; breath: number; selfHarm: number; stroke: number; measurement: number; advice: number; child: number; distress: number; human: number }>;
function answers(o: Over = {}): Answers {
  const v = { urgency: 0.5, urgencyConf: 0.9, dep: "scheduling", depConf: 0.9, chest: 0.02, breath: 0.02, selfHarm: 0.02, stroke: 0.02, measurement: 0.05, advice: 0.05, child: 0.05, distress: 0.5, human: 0.05, ...o };
  const score = (s: number, n: number) => ({ type: "score" as const, score: s, probabilities: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === Math.round(s) ? 1 : 0])), legend: {}, confidence: v.urgencyConf });
  return {
    urgency: score(v.urgency, 4),
    department: { type: "choice", choice: v.dep, probabilities: { [v.dep]: 1 }, confidence: v.depConf },
    red_flag_chest_pain: { type: "noul", noul: v.chest },
    red_flag_breathing: { type: "noul", noul: v.breath },
    red_flag_self_harm: { type: "noul", noul: v.selfHarm },
    red_flag_stroke_or_bleeding: { type: "noul", noul: v.stroke },
    mentions_measurement: { type: "noul", noul: v.measurement },
    requests_medical_advice: { type: "noul", noul: v.advice },
    about_child: { type: "noul", noul: v.child },
    distress: score(v.distress, 3),
    wants_callback_or_human: { type: "noul", noul: v.human },
  };
}

describe("C2 dataset and questions", () => {
  it("has 16 labelled messages and 11 valid triage questions", () => {
    expect(PATIENT_MESSAGES).toHaveLength(16);
    expect(new Set(PATIENT_MESSAGES.map((m) => m.id)).size).toBe(16);
    expect(PATIENT_MESSAGES.filter((m) => m.expected_lanes[0] === "emergency").length).toBeGreaterThanOrEqual(3);
    expect(validateQuestions(C2_QUESTIONS)).toEqual([]);
    expect(Object.keys(C2_QUESTIONS)).toEqual([...C2_QUESTION_IDS]);
    const dep = C2_QUESTIONS.department!;
    if (dep.type !== "choice") throw new Error("department must be a choice");
    expect(Object.keys(dep.criteria)).toEqual([...DEPARTMENTS]);
    expect(C2_NOT_ASKED.length).toBeGreaterThanOrEqual(3);
    expect(buildPatientState(PATIENT_MESSAGES[0]!)).toEqual({ message: PATIENT_MESSAGES[0]!.text, channel: "portal" });
  });
});

describe("C2 vitals parsed in code", () => {
  it("flags temperatures, glucose, blood pressure and oxygen against thresholds and ignores other numbers", () => {
    expect(extractVitals("her temperature was 103.5 F")).toEqual([{ kind: "high_fever", value: "103.5 °F", severity: "same_day" }]);
    expect(extractVitals("temp 38.2 C this morning")).toEqual([]);
    expect(extractVitals("My blood sugar this morning read 350")).toEqual([{ kind: "glucose_high", value: "350 mg/dL", severity: "same_day" }]);
    expect(extractVitals("glucose was 55 and shaky")[0]).toMatchObject({ kind: "glucose_low", severity: "emergency" });
    expect(extractVitals("BP at home 185/95")).toEqual([{ kind: "hypertensive_crisis", value: "185/95", severity: "emergency" }]);
    expect(extractVitals("oxygen reads 88% on my finger thing")).toEqual([{ kind: "low_oxygen", value: "88%", severity: "emergency" }]);
    expect(extractVitals("my LDL cholesterol came back at 160")).toEqual([]);
    expect(extractVitals("appointment on the 3rd at 10")).toEqual([]);
    expect(extractVitals("BP 120/80 and sugar 110, all fine")).toEqual([]);
    // Negatives that used to escalate: drug strengths, durations, ages, dates, mmol, CO2, keyword substrings.
    expect(extractVitals("Please refill my Augmentin 875/125")).toEqual([]);
    expect(extractVitals("Percocet 10/325 and Bactrim 800/160 as before")).toEqual([]);
    expect(extractVitals("I cut out sugar for 30 days, can I book a follow-up?")).toEqual([]);
    expect(extractVitals("my glucose was 22 mmol/L this morning")).toEqual([]);
    expect(extractVitals("he has had a fever, he is 45")).toEqual([]);
    expect(extractVitals("my BP appointment was on 9/23")).toEqual([]);
    expect(extractVitals("CO2 levels 40 in the room, temporary headache")).toEqual([]);
    expect(extractVitals("very satisfied, sugar-free diet, 200 mg ibuprofen")).toEqual([]);
    expect(extractVitals("bp 180/80")).toEqual([{ kind: "hypertensive_crisis", value: "180/80", severity: "emergency" }]); // plausible, systolic at the threshold
    expect(extractVitals("bp 120/120")).toEqual([]); // implausible (systolic must exceed diastolic)
  });
  it("accepts common variants and takes the worst of several temperatures", () => {
    expect(extractVitals("temp 38.2 C but tonight it hit 104 F")).toEqual([{ kind: "high_fever", value: "104 °F", severity: "same_day" }]);
    expect(extractVitals("BP was 185 over 95 tonight")).toEqual([{ kind: "hypertensive_crisis", value: "185/95", severity: "emergency" }]);
    expect(extractVitals("O2 sat 88 on the finger monitor")).toEqual([{ kind: "low_oxygen", value: "88%", severity: "emergency" }]);
    expect(extractVitals("oxygen level 88 percent")).toEqual([{ kind: "low_oxygen", value: "88%", severity: "emergency" }]);
    expect(extractVitals("her temperature was 39.1 this morning")).toEqual([]); // unit-less Celsius-range number is not trusted
  });
});

describe("C2 triage rules", () => {
  const t = C2_THRESHOLDS;
  it("red flags are hard rules at 0.7 and the grey band gets a nurse", () => {
    expect(triage(answers({ chest: 0.7, dep: "billing" }), "x", t)).toMatchObject({ lane: "emergency", ruleId: "red_flag" });
    expect(triage(answers({ chest: 0.69, dep: "billing" }), "x", t).lane).toBe("nurse_same_day");
    expect(triage(answers({ chest: 0.35 }), "x", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "red_flag_review" });
    expect(triage(answers({ chest: 0.34 }), "x", t).lane).toBe("scheduling");
    const sh = triage(answers({ selfHarm: 0.9 }), "x", t);
    expect(sh.lane).toBe("emergency");
    expect(sh.reasons.join(" ")).toMatch(/行为健康/);
  });
  it("vital-sign thresholds from code outrank department", () => {
    expect(triage(answers({ dep: "scheduling" }), "oxygen 88%", t)).toMatchObject({ lane: "emergency", ruleId: "vitals_emergency" });
    expect(triage(answers({ dep: "scheduling" }), "temperature 103.5 F", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "vitals_same_day" });
  });
  it("urgency, callback, department confidence and advice rules", () => {
    expect(triage(answers({ urgency: 2.5, dep: "physician" }), "x", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "urgency" });
    expect(triage(answers({ urgency: 2.49, dep: "physician" }), "x", t).lane).toBe("physician");
    expect(triage(answers({ human: 0.8 }), "x", t)).toMatchObject({ lane: "human_review", ruleId: "wants_human" });
    const nurseCallback = triage(answers({ dep: "nursing", urgency: 2.0, human: 0.9 }), "x", t); // clinical concern keeps its clinical route
    expect(nurseCallback).toMatchObject({ lane: "nurse_same_day", ruleId: "nursing_same_day" });
    expect(nurseCallback.reasons).toContain("同时要求回电");
    expect(triage(answers({ dep: "physician", urgency: 2.4, human: 0.9 }), "x", t).lane).toBe("physician"); // callback noted, clinical route kept
    expect(triage(answers({ urgency: 2.85, dep: "physician" }), "x", t)).toMatchObject({ lane: "emergency", ruleId: "urgency_emergency" });
    expect(triage(answers({ urgency: 2.84, dep: "physician" }), "x", t).lane).toBe("nurse_same_day");
    expect(triage(answers({ dep: "other" }), "x", t)).toMatchObject({ lane: "human_review", ruleId: "department_other" });
    expect(triage(answers({ dep: "billing", depConf: 0.59 }), "x", t)).toMatchObject({ lane: "human_review", ruleId: "department_uncertain" });
    expect(triage(answers({ dep: "nursing", depConf: 0.51, urgency: 2.05 }), "x", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "clinical_uncertain_department" });
    const split = answers({ dep: "physician", depConf: 0.55, urgency: 1.2 });
    (split.department as { probabilities: Record<string, number> }).probabilities = { physician: 0.55, nursing: 0.4, billing: 0.05 };
    expect(triage(split, "x", t)).toMatchObject({ lane: "physician", ruleId: "clinical_split" });
    const adminSplit = answers({ dep: "billing", depConf: 0.55, urgency: 0.2 });
    (adminSplit.department as { probabilities: Record<string, number> }).probabilities = { billing: 0.55, scheduling: 0.45 };
    expect(triage(adminSplit, "x", t)).toMatchObject({ lane: "human_review", ruleId: "department_uncertain" });
    expect(triage(answers({ dep: "nursing", depConf: 0.51, urgency: 1.49 }), "x", t)).toMatchObject({ lane: "physician", ruleId: "clinical_split" }); // fixture puts all mass on nursing
    expect(triage(answers({ dep: "pharmacy_refill", advice: 0.7 }), "x", t)).toMatchObject({ lane: "physician", ruleId: "advice_to_clinician" });
    expect(triage(answers({ dep: "pharmacy_refill", advice: 0.69 }), "x", t).lane).toBe("pharmacy");
    expect(triage(answers({ dep: "nursing", urgency: 1.5 }), "x", t).lane).toBe("nurse_same_day");
    expect(triage(answers({ dep: "nursing", urgency: 1.49 }), "x", t).lane).toBe("physician");
    expect(triage(answers({ dep: "behavioral_health" }), "x", t).lane).toBe("behavioral_health");
  });
  it("fails closed on incomplete answers and uses mentions_measurement as the fallback for regex misses", () => {
    const partial = answers();
    delete partial.red_flag_self_harm;
    expect(triage(partial, "x", t)).toMatchObject({ lane: "human_review", ruleId: "incomplete_answers" });
    expect(triage(answers({ measurement: 0.9, dep: "scheduling", urgency: 1.6 }), "my reading was way off", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "unparsed_measurement" });
    expect(triage(answers({ measurement: 0.9, dep: "scheduling", urgency: 0.3 }), "my reading was way off", t).lane).toBe("scheduling");
    expect(Object.keys(LANE_PRIORITY).sort()).toEqual(["behavioral_health", "billing", "emergency", "human_review", "nurse_same_day", "pharmacy", "physician", "scheduling"]);
  });
});
