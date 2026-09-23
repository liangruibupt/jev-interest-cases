/** Synthetic English patient-portal messages for C2. No real patient data. Hand-labelled acceptable lanes for smoke checks. */
export type TriageLane = "emergency" | "nurse_same_day" | "physician" | "pharmacy" | "scheduling" | "billing" | "behavioral_health" | "human_review";

export interface PatientMessage {
  id: string;
  channel: "portal" | "phone_transcript";
  text: string;
  /** Acceptable lanes (first = primary). */
  expected_lanes: TriageLane[];
  note_zh: string;
}

export const PATIENT_MESSAGES: PatientMessage[] = [
  { id: "P01", channel: "portal", text: "I've had a tight, crushing pain in the middle of my chest for the last 40 minutes and it's spreading into my left arm. I'm sweating and feel sick. Should I come in?", expected_lanes: ["emergency"], note_zh: "红旗：胸痛放射至手臂 → 急诊硬规则" },
  { id: "P02", channel: "portal", text: "Hi, I'm down to my last three lisinopril tablets. Could you send a refill of my usual 10 mg to the Walgreens on Pine Street? Thanks.", expected_lanes: ["pharmacy"], note_zh: "常规续药" },
  { id: "P03", channel: "portal", text: "I need to move my appointment with Dr. Alvarez from next Tuesday to later in the week if possible. Any afternoon works.", expected_lanes: ["scheduling"], note_zh: "改约" },
  { id: "P04", channel: "portal", text: "I saw my lab results in the app and my LDL cholesterol came back at 160. Is that something I should be worried about, and should I change anything before my next visit?", expected_lanes: ["physician"], note_zh: "化验结果咨询：LDL 不在代码阈值表里，只按文字判断" },
  { id: "P05", channel: "phone_transcript", text: "My four-year-old has had a fever for three days now. This morning her temperature was 103.5 F and she is not drinking much. She's sleepy but wakes up when I talk to her.", expected_lanes: ["nurse_same_day", "emergency"], note_zh: "儿童发热：103.5°F 由代码判为高热 → 当天护士" },
  { id: "P06", channel: "portal", text: "Honestly I don't see the point in going on anymore. I haven't slept in days and I keep thinking everyone would be better off without me.", expected_lanes: ["emergency"], note_zh: "红旗：自伤念头 → 急诊 + 行为健康" },
  { id: "P07", channel: "portal", text: "My statement shows a $240 charge for the visit on the 3rd but my insurance said it was covered. Can someone check the billing code?", expected_lanes: ["billing"], note_zh: "账单问题" },
  { id: "P08", channel: "portal", text: "I started the amoxicillin you prescribed two days ago and now I have an itchy red rash on my chest and arms. No trouble breathing and my face isn't swollen. Should I keep taking it?", expected_lanes: ["nurse_same_day", "physician"], note_zh: "药物皮疹，明确无呼吸困难 → 当天护士，不是急诊" },
  { id: "P09", channel: "phone_transcript", text: "My blood sugar this morning read 350 and I've felt dizzy and really thirsty since last night. I took my metformin as usual.", expected_lanes: ["nurse_same_day", "emergency"], note_zh: "血糖 350 由代码判为超范围 → 当天护士" },
  { id: "P10", channel: "portal", text: "I'm 14 weeks pregnant and have a bad headache. Is it safe for me to take ibuprofen, or is there something else I should use?", expected_lanes: ["physician", "nurse_same_day"], note_zh: "索要用药建议 → 临床人员，不能由客服回答" },
  { id: "P11", channel: "portal", text: "It's been five days since my knee surgery. The incision is red and warm around the edges and there's some yellow fluid on the bandage this morning. It hurts more than yesterday.", expected_lanes: ["nurse_same_day", "physician"], note_zh: "术后伤口感染征象 → 当天" },
  { id: "P12", channel: "portal", text: "General question: how many minutes of exercise per week would you recommend for someone my age with mild high blood pressure? No rush.", expected_lanes: ["physician"], note_zh: "低紧急度的健康咨询" },
  { id: "P13", channel: "portal", text: "It's about what we talked about at my last visit. Can someone call me back when they get a chance?", expected_lanes: ["human_review"], note_zh: "内容不明 → 人工" },
  { id: "P14", channel: "phone_transcript", text: "I have been waiting on hold for forty minutes and this is the third time this week nobody calls me back. I want to speak to a manager about how this clinic treats people.", expected_lanes: ["human_review"], note_zh: "投诉、要求主管 → 人工" },
  { id: "P15", channel: "portal", text: "How many ibuprofen can I take at once for my lower back pain? The bottle says two but that isn't doing anything.", expected_lanes: ["physician", "nurse_same_day"], note_zh: "索要剂量 → 临床人员" },
  { id: "P16", channel: "phone_transcript", text: "Since this morning I've been short of breath even sitting down, and my daughter says my lips look a bit blue. I have COPD.", expected_lanes: ["emergency"], note_zh: "红旗：呼吸困难 + 口唇发紫 → 急诊" },
];
