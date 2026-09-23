import type { PatientMessage } from "../../datasets/patientMessages";
import type { Questions } from "../../types";

export const C2_QUESTION_IDS = [
  "urgency", "department", "red_flag_chest_pain", "red_flag_breathing", "red_flag_self_harm", "red_flag_stroke_or_bleeding",
  "mentions_measurement", "requests_medical_advice", "about_child", "distress", "wants_callback_or_human",
] as const;
export const RED_FLAG_IDS = ["red_flag_chest_pain", "red_flag_breathing", "red_flag_self_harm", "red_flag_stroke_or_bleeding"] as const;
export type RedFlagId = (typeof RED_FLAG_IDS)[number];
export const DEPARTMENTS = ["scheduling", "billing", "pharmacy_refill", "nursing", "physician", "behavioral_health", "other"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** Triage questions only: nothing here asks what the patient has or what they should take. */
export const C2_QUESTIONS: Questions = {
  urgency: {
    type: "score",
    instructions: { question: "How soon does `message` need clinical attention?", focus: "Judge from what the sender describes, not from how worried they sound." },
    criteria: [
      "Routine administrative or scheduling matter, or a general question with no symptoms",
      "A clinical question or mild concern that can wait a few days",
      "Symptoms or a situation that need clinical attention the same day",
      "A possible emergency: symptoms that could be life-threatening or rapidly worsening",
    ],
  },
  department: {
    type: "choice",
    instructions: { question: "Who should handle `message`?", focus: "Pick the single team whose work this is." },
    criteria: {
      scheduling: { what: "Booking, moving, or cancelling appointments" },
      billing: { what: "Charges, statements, insurance coverage" },
      pharmacy_refill: { what: "Refilling an existing prescription", not_for: "Questions about whether or how to take a drug" },
      nursing: { what: "Symptoms, side effects, wound or fever concerns that a nurse should assess" },
      physician: { what: "Questions about results, medications, treatment, or health advice that need a clinician's judgment" },
      behavioral_health: { what: "Mood, anxiety, sleep, thoughts of self-harm" },
      other: "Complaints, unclear requests, or anything not listed",
    },
  },
  red_flag_chest_pain: {
    type: "noul",
    instructions: "Does `message` describe chest pain or chest pressure happening now or very recently, especially spreading to the arm, jaw, or back?",
  },
  red_flag_breathing: {
    type: "noul",
    instructions: "Does `message` describe difficulty breathing, shortness of breath at rest, or bluish lips or face?",
    criteria: { true: "It reports trouble breathing or blue lips now", false: "It explicitly says breathing is fine, or does not mention breathing" },
  },
  red_flag_self_harm: {
    type: "noul",
    instructions: "Does `message` suggest the sender may be thinking about harming themselves or ending their life?",
  },
  red_flag_stroke_or_bleeding: {
    type: "noul",
    instructions: "Does `message` describe sudden weakness or numbness, facial drooping, slurred speech, sudden confusion, or heavy bleeding that will not stop?",
  },
  mentions_measurement: {
    type: "noul",
    instructions: "Does `message` include a specific measured value, such as a temperature, blood sugar reading, blood pressure, oxygen level, or lab result number?",
  },
  requests_medical_advice: {
    type: "noul",
    instructions: "Does `message` ask for a diagnosis, a specific medication dose, or whether a medication is safe to take, rather than for administrative help?",
  },
  about_child: {
    type: "noul",
    instructions: "Is `message` about a child or infant rather than about the sender themselves?",
  },
  distress: {
    type: "score",
    instructions: "How distressed does the sender of `message` sound?",
    criteria: ["Calm or neutral", "Worried or frustrated but composed", "Very frightened, desperate, or angry"],
  },
  wants_callback_or_human: {
    type: "noul",
    instructions: "Does `message` explicitly ask to speak with a person, a manager, or to be called back?",
  },
};

/** Questions deliberately not sent to Jev — the boundary between triage and diagnosis. */
export const C2_NOT_ASKED: { question: string; why_zh: string }[] = [
  { question: "What condition does the patient have?", why_zh: "诊断是专科多步推理，不是读一段文字能下的常识判断；Jev 也不是医疗器械。" },
  { question: "What dose should they take?", why_zh: "用药决定属于临床人员；Jev 只判断\"是否在索要剂量\"，然后转给医生。" },
  { question: "Is 103.5 °F dangerous?", why_zh: "数值比较在代码里做（vitals.ts 的阈值表）；Jev 只回答\"有没有提到测量值\"。" },
  { question: "Will this get worse by tonight?", why_zh: "预测不是判断；Jev 只对文字描述的当下状况给紧急度。" },
];

export function buildPatientState(m: PatientMessage): { message: string; channel: string } {
  return { message: m.text, channel: m.channel };
}
