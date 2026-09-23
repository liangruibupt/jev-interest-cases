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

/** Vital-sign numbers are parsed and compared in code. Jev is only asked whether a measurement is mentioned. */
export function extractVitals(text: string, t: C2Thresholds = C2_THRESHOLDS): VitalFlag[] {
  const flags: VitalFlag[] = [];
  const temp = /(?:temperature|temp|fever)[^\d]{0,20}(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?([fc])?\b/i.exec(text) ?? /\b(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?([fc])\b/i.exec(text);
  if (temp?.[1]) {
    const raw = Number(temp[1]);
    const unit = (temp[2] ?? (raw > 45 ? "f" : "c")).toLowerCase();
    const c = unit === "f" ? fToC(raw) : raw;
    if (c >= t.feverC) flags.push({ kind: "high_fever", value: `${temp[1]} °${unit.toUpperCase()}`, severity: "same_day" });
  }
  const glucose = /(?:blood sugar|glucose|sugar)[^\d]{0,25}(\d{2,3})\b/i.exec(text);
  if (glucose?.[1]) {
    const g = Number(glucose[1]);
    if (g >= t.glucoseHigh) flags.push({ kind: "glucose_high", value: `${g} mg/dL`, severity: "same_day" });
    else if (g <= t.glucoseLow) flags.push({ kind: "glucose_low", value: `${g} mg/dL`, severity: "emergency" });
  }
  const bp = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(text);
  if (bp?.[1] && bp[2]) {
    const sys = Number(bp[1]);
    const dia = Number(bp[2]);
    if (sys >= t.systolicCrisis || dia >= t.diastolicCrisis) flags.push({ kind: "hypertensive_crisis", value: `${sys}/${dia}`, severity: "emergency" });
  }
  const spo2 = /(?:oxygen|o2|sat(?:uration)?|spo2)[^\d]{0,20}(\d{2,3})\s*%/i.exec(text);
  if (spo2?.[1]) {
    const s = Number(spo2[1]);
    if (s <= t.spo2Low) flags.push({ kind: "low_oxygen", value: `${s}%`, severity: "emergency" });
  }
  return flags;
}
