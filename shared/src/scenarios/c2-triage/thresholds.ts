export const C2_THRESHOLDS = {
  /** Any red-flag Noul at or above this → emergency, whatever else Jev says. */
  act: 0.7,
  /** Red flag in [review, act) → a clinician looks the same day. */
  review: 0.35,
  urgencySameDay: 2.5,
  /** urgency at or above this without any red flag → emergency anyway (situations the four red flags do not name). */
  urgencyEmergency: 2.85,
  /** nursing department: at or above → nurse same day, below → physician queue. */
  urgencyPhysician: 1.5,
  departmentMin: 0.6,
  humanMin: 0.8,
  adviceMin: 0.7,
  // Vital-sign thresholds compared in code, never by Jev.
  feverC: 39,
  glucoseHigh: 300,
  glucoseLow: 60,
  systolicCrisis: 180,
  diastolicCrisis: 120,
  spo2Low: 92,
} as const;
export type C2Thresholds = { -readonly [K in keyof typeof C2_THRESHOLDS]: number };
