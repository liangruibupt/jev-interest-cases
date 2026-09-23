export interface ExtractedNumber {
  value: number;
  unit: "celsius" | "percent" | "level" | "bare";
}

const PATTERNS: { unit: ExtractedNumber["unit"]; re: RegExp }[] = [
  { unit: "celsius", re: /(-?\d+(?:\.\d+)?)\s*(?:°\s*c?\b|degrees?\b|deg\b|celsius\b)/i },
  { unit: "percent", re: /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/i },
  { unit: "level", re: /(?:level|volume|to)\s+(\d+(?:\.\d+)?)\b/i },
  { unit: "bare", re: /\b(\d+(?:\.\d+)?)\b/ },
];

/** Numbers are parsed by code, never by Jev. Unit-tagged numbers win over bare ones. */
export function extractNumber(text: string): ExtractedNumber | null {
  for (const { unit, re } of PATTERNS) {
    const m = re.exec(text);
    if (m?.[1] !== undefined) return { value: Number(m[1]), unit };
  }
  return null;
}
