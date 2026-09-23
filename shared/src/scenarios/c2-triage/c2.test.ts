import { describe, expect, it } from "vitest";
import { PATIENT_MESSAGES } from "../../datasets/patientMessages";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { C2_NOT_ASKED, C2_QUESTIONS, C2_QUESTION_IDS, C2_THRESHOLDS, DEPARTMENTS, buildPatientState, extractVitals, triage } from "./index";

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
    expect(triage(answers({ dep: "other" }), "x", t)).toMatchObject({ lane: "human_review", ruleId: "department_other" });
    expect(triage(answers({ dep: "billing", depConf: 0.59 }), "x", t)).toMatchObject({ lane: "human_review", ruleId: "department_uncertain" });
    expect(triage(answers({ dep: "nursing", depConf: 0.51, urgency: 2.05 }), "x", t)).toMatchObject({ lane: "nurse_same_day", ruleId: "clinical_uncertain_department" });
    expect(triage(answers({ dep: "nursing", depConf: 0.51, urgency: 1.49 }), "x", t)).toMatchObject({ lane: "human_review" });
    expect(triage(answers({ dep: "pharmacy_refill", advice: 0.7 }), "x", t)).toMatchObject({ lane: "physician", ruleId: "advice_to_clinician" });
    expect(triage(answers({ dep: "pharmacy_refill", advice: 0.69 }), "x", t).lane).toBe("pharmacy");
    expect(triage(answers({ dep: "nursing", urgency: 1.5 }), "x", t).lane).toBe("nurse_same_day");
    expect(triage(answers({ dep: "nursing", urgency: 1.49 }), "x", t).lane).toBe("physician");
    expect(triage(answers({ dep: "behavioral_health" }), "x", t).lane).toBe("behavioral_health");
  });
});
