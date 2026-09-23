export interface MoneyMention {
  text: string;
  kind: "usd" | "percent";
}

/** Amounts are extracted by code for display only; Jev is never asked to compare or compute them. */
export function extractAmounts(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  for (const m of text.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:billion|million|thousand)?\b/gi)) out.push({ text: m[0].replace(/\s+/g, " ").trim(), kind: "usd" });
  for (const m of text.matchAll(/(?<![\d.])-?\d+(?:\.\d+)?\s?%/g)) out.push({ text: m[0].replace(/\s+/g, ""), kind: "percent" });
  return out;
}
