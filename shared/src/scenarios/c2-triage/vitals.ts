import { C2_THRESHOLDS, type C2Thresholds } from "./thresholds";

export interface VitalFlag {
  kind: "high_fever" | "glucose_high" | "glucose_low" | "hypertensive_crisis" | "low_oxygen";
  value: string;
  severity: "emergency" | "same_day";
}

export const VITAL_LABELS_ZH: Record<VitalFlag["kind"], string> = {
  high_fever: "高热",
  glucose_high: "血糖过高",
  glucose_low: "血糖过低",
  hypertensive_crisis: "血压危象",
  low_oxygen: "血氧过低",
};

const fToC = (f: number): number => ((f - 32) * 5) / 9;

/**
 * Vital-sign numbers are parsed and compared in code; Jev is only asked whether a measurement is mentioned.
 * Every pattern is keyword-anchored and bounded to plausible ranges so drug strengths ("Augmentin 875/125"),
 * durations ("sugar for 30 days") and ages ("he is 45") never read as vital signs.
 */
export function extractVitals(text: string, t: C2Thresholds = C2_THRESHOLDS): VitalFlag[] {
  const flags: VitalFlag[] = [];

  // Temperature: keyword-anchored, or any number with an explicit °F / °C unit. Unit-less values are accepted only in
  // the Fahrenheit fever band (95–110); a Celsius reading must carry its unit. Take the worst reading, not the first.
  let worstC: { c: number; text: string } | null = null;
  const tempRe = /(?:\b(?:temperature|temp|fever)\b[^\d]{0,20}(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?([fc])?\b|\b(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?([fc])\b)/gi;
  for (const m of text.matchAll(tempRe)) {
    const raw = Number(m[1] ?? m[3]);
    const unitRaw = (m[2] ?? m[4])?.toLowerCase();
    let c: number | null = null;
    if (unitRaw === "f") c = fToC(raw);
    else if (unitRaw === "c") c = raw;
    else if (raw >= 95 && raw <= 110) c = fToC(raw);
    if (c === null || c < 30 || c > 45) continue;
    if (!worstC || c > worstC.c) worstC = { c, text: `${m[1] ?? m[3]} °${(unitRaw ?? "f").toUpperCase()}` };
  }
  if (worstC && worstC.c >= t.feverC) flags.push({ kind: "high_fever", value: worstC.text, severity: "same_day" });

  // Glucose (mg/dL): keyword at a word boundary; reject durations, doses, percentages and mmol readings.
  const glucoseRe = /\b(?:blood sugar|glucose|sugar)\b[^\d]{0,25}(\d{2,3})\b(?!\s*(?:days?|weeks?|hours?|minutes?|months?|years?|%|percent|mmol|mcg|ml|tablets?|pills?|mg(?!\s*\/\s*dL)))/gi;
  for (const m of text.matchAll(glucoseRe)) {
    const g = Number(m[1]);
    if (g < 20 || g > 900) continue;
    if (g >= t.glucoseHigh) flags.push({ kind: "glucose_high", value: `${g} mg/dL`, severity: "same_day" });
    else if (g <= t.glucoseLow) flags.push({ kind: "glucose_low", value: `${g} mg/dL`, severity: "emergency" });
  }

  // Blood pressure: keyword-anchored "sys/dia" or "sys over dia", plausible ranges, not followed by a dose unit.
  for (const m of text.matchAll(/\b(?:bp|blood pressure|pressure|systolic)\b[^\d]{0,25}(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b(?!\s*(?:mg|mcg|ml))/gi)) {
    const sys = Number(m[1]);
    const dia = Number(m[2]);
    if (sys < 70 || sys > 260 || dia < 40 || dia > 160 || sys <= dia) continue;
    if (sys >= t.systolicCrisis || dia >= t.diastolicCrisis) flags.push({ kind: "hypertensive_crisis", value: `${sys}/${dia}`, severity: "emergency" });
  }

  // Oxygen saturation: keyword-anchored; "%", "percent" or a bare 70–100 after sat/spo2/oxygen.
  for (const m of text.matchAll(/\b(?:oxygen(?: level| saturation)?|o2(?: sat(?:uration)?)?|spo2|sat(?:uration)?)\b[^\d]{0,20}(\d{2,3})\s*(%|percent)?/gi)) {
    const s = Number(m[1]);
    if (s < 50 || s > 100) continue;
    if (!m[2] && (s < 70 || s > 100)) continue;
    if (s <= t.spo2Low) flags.push({ kind: "low_oxygen", value: `${s}%`, severity: "emergency" });
  }
  return flags;
}
