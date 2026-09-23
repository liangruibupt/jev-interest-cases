# P11 · C2 患者留言分诊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the C2 page: 16 patient-portal messages are triaged by one Jev request each (11 questions: urgency Score, department Choice, four red-flag Nouls, measurement / advice / child / callback Nouls, distress Score). Code parses vital-sign numbers and compares them to thresholds (Jev never compares numbers); an ordered rule set assigns a lane (emergency / nurse same day / physician / pharmacy / scheduling / billing / behavioral health / human review). The page is a triage worklist sorted by lane priority, shows the rule that fired, and lists explicitly the questions Jev is **not** asked (diagnosis, dose, "is this value dangerous").

**Architecture:** `shared/src/datasets/patientMessages.ts` (16 messages with expected lanes) and `shared/src/scenarios/c2-triage/{questions,thresholds,vitals,triage,index}.ts`. `POST /api/c2/triage` fans out one Jev request per message. Pure Jev — no Claude (the point is the boundary between triage and diagnosis).

**Spec:** `docs/06-行业场景适用性.md` (医疗 row).

## Global Constraints

- Red flags are hard rules: any red-flag Noul ≥ 0.7 → emergency lane regardless of department or urgency. Self-harm additionally tags behavioral health.
- Vital signs are parsed in code (`vitals.ts`): temperature (°F/°C), blood glucose (mg/dL), blood pressure (systolic/diastolic), oxygen saturation (%). Thresholds live in `thresholds.ts`; Jev only answers `mentions_measurement`.
- Messages are synthetic and English; no real patient data. UI Chinese.
- Cache read-write for the 16 messages; `live` bypasses.

---

### Task 1: shared

```ts
export type TriageLane = "emergency" | "nurse_same_day" | "physician" | "pharmacy" | "scheduling" | "billing" | "behavioral_health" | "human_review";
export interface PatientMessage { id: string; channel: "portal" | "phone_transcript"; text: string; expected_lanes: TriageLane[]; note_zh: string }
export const PATIENT_MESSAGES: PatientMessage[];      // 16
export const C2_QUESTIONS: Questions;                 // urgency, department, red_flag_chest_pain, red_flag_breathing, red_flag_self_harm, red_flag_stroke_or_bleeding, mentions_measurement, requests_medical_advice, about_child, distress, wants_callback_or_human
export function buildPatientState(m: PatientMessage): { message: string; channel: string };
export const C2_THRESHOLDS = { act: 0.7, review: 0.35, urgencySameDay: 2.5, urgencyPhysician: 1.5, departmentMin: 0.6, humanMin: 0.8, adviceMin: 0.7, feverC: 39, glucoseHigh: 300, glucoseLow: 60, systolicCrisis: 180, diastolicCrisis: 120, spo2Low: 92 };
export interface VitalFlag { kind: "high_fever" | "glucose_high" | "glucose_low" | "hypertensive_crisis" | "low_oxygen"; value: string; severity: "emergency" | "same_day" }
export function extractVitals(text: string, t?: typeof C2_THRESHOLDS): VitalFlag[];
export interface TriageDecision { lane: TriageLane; ruleId: string; rule_zh: string; reasons: string[]; redFlags: { id: string; value: number }[]; vitals: VitalFlag[]; urgency: number; department: { choice: string; confidence: number }; distress: number }
export function triage(answers: Answers, text: string, t?: typeof C2_THRESHOLDS): TriageDecision;
export const TRIAGE_LANE_LABELS_ZH: Record<TriageLane, string>;
export const LANE_PRIORITY: Record<TriageLane, number>;
export const C2_NOT_ASKED: { question: string; why_zh: string }[];   // the questions deliberately not sent to Jev
```

Rules in order: (1) any red flag ≥ act → emergency (self_harm → reasons note behavioral health) · (2) vitals with severity emergency → emergency · (3) vitals same_day or urgency ≥ urgencySameDay → nurse_same_day · (4) any red flag in [review, act) → nurse_same_day (grey band gets a clinician) · (5) wants_callback_or_human ≥ humanMin or department = other → human_review · (6) department.confidence < departmentMin → nurse_same_day if urgency ≥ urgencyPhysician (a clinical concern never goes to an administrative queue), else human_review · (7) requests_medical_advice ≥ adviceMin and department ∈ {scheduling, billing, pharmacy_refill} → physician · (8) lane by department (nursing → nurse_same_day if urgency ≥ urgencyPhysician else physician).

- [ ] Tests: dataset (16, unique ids, ≥ 3 emergency labels); questions validate (11 ids, department options); vitals ("103.5 F" → high_fever; "38.2 C" none; "blood sugar 350" glucose_high; "BP 185/95" crisis; "oxygen 88%" low_oxygen; "LDL 160" none; no numbers → []); triage boundaries (red flag 0.7 vs 0.69; review band 0.35; urgency 2.5; department conf 0.59; callback 0.8; advice → physician; nursing split at 1.5).
- [ ] FAIL → implement → PASS → commit.

### Task 2: server — `POST /api/c2/triage { ids?, live? }` fan-out like A2; tests; mount; commit.

### Task 3: web — `/c2` worklist: lanes as sections in priority order (emergency first), message cards with urgency ScoreLine, red-flag chips (value), vitals chips from code, department + confidence, distress, fired rule; sidebar: threshold sliders (act, urgencySameDay, departmentMin) re-run in browser; "没有问 Jev 的问题" panel (C2_NOT_ASKED); hard-rule list; SavingsCard c2; RequestInspector; LearningCard. Screenshot `docs/screenshots/c2-triage.png`. Commit.

### Task 4: smoke `c2` (16 messages cache off, ≥ 14/16 in expected lanes, all 3 emergency-labelled messages in emergency, no routine message in emergency), `docs/scenarios/C2.md`, README/index/cost/06 updates, warm-cache, gate, review, ff-merge.
