import type { TriageLane } from "../../datasets/patientMessages";
import type { Answers } from "../../types";
import { DEPARTMENTS, RED_FLAG_IDS, type Department, type RedFlagId } from "./questions";
import { C2_THRESHOLDS, type C2Thresholds } from "./thresholds";
import { extractVitals, type VitalFlag } from "./vitals";

export interface TriageDecision {
  lane: TriageLane;
  ruleId: string;
  rule_zh: string;
  reasons: string[];
  redFlags: { id: RedFlagId; value: number }[];
  mentionsMeasurement: number;
  vitals: VitalFlag[];
  urgency: number;
  urgencyConfidence: number | null;
  department: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  distress: number;
  requestsAdvice: number;
  aboutChild: number;
  wantsHuman: number;
}

export const TRIAGE_LANE_LABELS_ZH: Record<TriageLane, string> = {
  emergency: "急诊 / 立即处理",
  nurse_same_day: "护士当天",
  physician: "医生队列",
  pharmacy: "药房续药",
  scheduling: "预约",
  billing: "账单",
  behavioral_health: "行为健康",
  human_review: "人工判断",
};
export const LANE_PRIORITY: Record<TriageLane, number> = { emergency: 0, nurse_same_day: 1, human_review: 2, behavioral_health: 3, physician: 4, pharmacy: 5, scheduling: 6, billing: 7 };

const DEPARTMENT_LANE: Record<Department, TriageLane> = {
  scheduling: "scheduling",
  billing: "billing",
  pharmacy_refill: "pharmacy",
  nursing: "nurse_same_day",
  physician: "physician",
  behavioral_health: "behavioral_health",
  other: "human_review",
};

/** Ordered first-match triage. Hard rules (red flags, vital-sign thresholds) come before anything Jev says about department. */
export function triage(answers: Answers, text: string, t: C2Thresholds = C2_THRESHOLDS): TriageDecision {
  const noul = (id: string): number => {
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };
  const missing = [...RED_FLAG_IDS, "urgency", "department"].filter((id) => answers[id] === undefined);
  const urgencyA = answers.urgency;
  const urgency = urgencyA && urgencyA.type === "score" ? urgencyA.score : 0;
  const urgencyConfidence = urgencyA && urgencyA.type === "score" ? urgencyA.confidence : null;
  const distressA = answers.distress;
  const distress = distressA && distressA.type === "score" ? distressA.score : 0;
  const depA = answers.department;
  const department = depA && depA.type === "choice" ? { choice: depA.choice, confidence: depA.confidence ?? 0, probabilities: depA.probabilities } : null;
  const redFlags = RED_FLAG_IDS.map((id) => ({ id, value: noul(id) }));
  const vitals = extractVitals(text, t);
  const requestsAdvice = noul("requests_medical_advice");
  const aboutChild = noul("about_child");
  const wantsHuman = noul("wants_callback_or_human");
  const mentionsMeasurement = noul("mentions_measurement");
  const base = { redFlags, vitals, urgency, urgencyConfidence, department, distress, requestsAdvice, aboutChild, wantsHuman, mentionsMeasurement };
  const decide = (lane: TriageLane, ruleId: string, rule_zh: string, reasons: string[]): TriageDecision => ({ lane, ruleId, rule_zh, reasons, ...base });

  // Fail closed: a response missing any red flag, urgency or department is never triaged automatically.
  if (missing.length) return decide("human_review", "incomplete_answers", "Jev 回答不完整 → 人工", missing.map((id) => `缺少 ${id}`));

  const firing = redFlags.filter((f) => f.value >= t.act);
  if (firing.length) {
    const reasons = firing.map((f) => `${f.id} ${f.value.toFixed(2)} ≥ ${t.act}`);
    if (firing.some((f) => f.id === "red_flag_self_harm")) reasons.push("自伤信号：同时通知行为健康团队");
    return decide("emergency", "red_flag", "任一红旗 Noul ≥ act → 急诊（硬规则）", reasons);
  }
  const emergencyVitals = vitals.filter((v) => v.severity === "emergency");
  if (emergencyVitals.length) return decide("emergency", "vitals_emergency", "代码比较的测量值达到危急阈值 → 急诊", emergencyVitals.map((v) => `${v.kind} ${v.value}`));
  const sameDayVitals = vitals.filter((v) => v.severity === "same_day");
  if (sameDayVitals.length) return decide("nurse_same_day", "vitals_same_day", "代码比较的测量值超出范围 → 护士当天", sameDayVitals.map((v) => `${v.kind} ${v.value}`));
  if (urgency >= t.urgencyEmergency) return decide("emergency", "urgency_emergency", `urgency ≥ ${t.urgencyEmergency}（四个红旗未覆盖的紧急情况）→ 急诊`, [`urgency ${urgency.toFixed(2)}`]);
  if (urgency >= t.urgencySameDay) return decide("nurse_same_day", "urgency", `urgency ≥ ${t.urgencySameDay} → 护士当天`, [`urgency ${urgency.toFixed(2)}`]);
  const grey = redFlags.filter((f) => f.value >= t.review);
  if (grey.length) {
    const reasons = grey.map((f) => `${f.id} ${f.value.toFixed(2)}`);
    if (grey.some((f) => f.id === "red_flag_self_harm")) reasons.push("自伤信号灰区：同时通知行为健康团队");
    return decide("nurse_same_day", "red_flag_review", `红旗落在 ${t.review}–${t.act} 灰区 → 护士当天看一眼`, reasons);
  }
  // The regex missed a measurement Jev saw: a clinician looks rather than an admin lane.
  if (mentionsMeasurement >= t.act && vitals.length === 0 && urgency >= t.urgencyPhysician) {
    return decide("nurse_same_day", "unparsed_measurement", `mentions_measurement ${mentionsMeasurement.toFixed(2)} ≥ ${t.act} 但代码未解析出数值 → 护士当天`, ["提到了测量值但代码未解析"]);
  }
  // "Please call me back" only wins for non-clinical messages; a clinical concern keeps its clinical route.
  const callback = wantsHuman >= t.humanMin;
  if (callback && urgency < t.urgencyPhysician) return decide("human_review", "wants_human", `wants_callback_or_human ≥ ${t.humanMin} 且 urgency < ${t.urgencyPhysician} → 人工`, [`wants_callback_or_human ${wantsHuman.toFixed(2)}`]);
  const extra = callback ? ["同时要求回电"] : [];
  if (!department || !(DEPARTMENTS as readonly string[]).includes(department.choice) || department.choice === "other") {
    return decide("human_review", "department_other", "department = other 或未知 → 人工", [`department = ${department?.choice ?? "?"}`, ...extra]);
  }
  if (department.confidence < t.departmentMin) {
    // A clinical concern with an unclear team still goes to a clinician, never to an administrative queue.
    if (urgency >= t.urgencyPhysician) return decide("nurse_same_day", "clinical_uncertain_department", `department 置信度 < ${t.departmentMin} 但 urgency ≥ ${t.urgencyPhysician} → 护士当天（拿不准时交临床人员）`, [`${department.choice} ${department.confidence.toFixed(2)}`, `urgency ${urgency.toFixed(2)}`, ...extra]);
    // Two clinical teams splitting the vote is still a clinical message.
    const clinicalMass = (department.probabilities.nursing ?? 0) + (department.probabilities.physician ?? 0) + (department.probabilities.behavioral_health ?? 0);
    if (clinicalMass >= t.departmentMin) return decide("physician", "clinical_split", `临床科室合计概率 ${clinicalMass.toFixed(2)} ≥ ${t.departmentMin}（单个科室不确定）→ 医生队列`, [`${department.choice} ${department.confidence.toFixed(2)}`, ...extra]);
    return decide("human_review", "department_uncertain", `department 置信度 < ${t.departmentMin} → 人工`, [`${department.choice} ${department.confidence.toFixed(2)}`, ...extra]);
  }
  const dep = department.choice as Department;
  if (requestsAdvice >= t.adviceMin && (dep === "scheduling" || dep === "billing" || dep === "pharmacy_refill")) {
    return decide("physician", "advice_to_clinician", `requests_medical_advice ≥ ${t.adviceMin} 但部门是非临床 → 医生队列`, [`requests_medical_advice ${requestsAdvice.toFixed(2)}`, `department ${dep}`, ...extra]);
  }
  if (dep === "nursing") {
    return urgency >= t.urgencyPhysician
      ? decide("nurse_same_day", "nursing_same_day", `department = nursing 且 urgency ≥ ${t.urgencyPhysician} → 护士当天`, [`urgency ${urgency.toFixed(2)}`, ...extra])
      : decide("physician", "nursing_routine", `department = nursing 但 urgency < ${t.urgencyPhysician} → 医生队列（非当天）`, [`urgency ${urgency.toFixed(2)}`, ...extra]);
  }
  return decide(DEPARTMENT_LANE[dep], "department", `department = ${dep}（置信度 ${department.confidence.toFixed(2)}）`, extra);
}
