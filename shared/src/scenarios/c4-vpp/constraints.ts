import type { VppSite } from "../../datasets/vppNotices";

export interface Constraint {
  kind: "min_capacity_kw" | "curtail_percent" | "time_window" | "deadline";
  text: string;
  value?: number;
  /** Only for min_capacity_kw: whether the site meets it (compared in code). */
  satisfied?: boolean;
}

const toKw = (value: number, unit: string): number => (unit.toLowerCase().startsWith("mw") ? value * 1000 : value);
const num = (s: string): number => Number(s.replace(/,/g, ""));

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const CAP_SUFFIX_RE = /(MW|kW)\s+(?:or larger|or more|and above|or above)\b/iy;
const isSpace = (ch: string): boolean => /\s/.test(ch);

/**
 * Linear-time equivalent of
 *   /(\d[\d,]*(?:\.\d+)?)\s*(MW|kW)\s+(?:or larger|or more|and above|or above)\b/i.exec(text)
 * That regex is unanchored with a leading `[\d,]*`, so a long digit run that is not followed by a
 * unit backtracks quadratically. Here each number token is matched once (greedy, as the regex would)
 * and the suffix is checked with a sticky regex that starts with a literal.
 */
function execCapSuffix(text: string): [string, string, string] | null {
  const numRe = new RegExp(NUMBER_RE.source, "g");
  const sfxRe = new RegExp(CAP_SUFFIX_RE.source, "iy");
  for (let m = numRe.exec(text); m; m = numRe.exec(text)) {
    let i = m.index + m[0].length;
    while (i < text.length && isSpace(text[i]!)) i++;
    sfxRe.lastIndex = i;
    const s = sfxRe.exec(text);
    if (s?.[1]) return [text.slice(m.index, i) + s[0], m[0], s[1]];
    // The regex would also retry from the digits after the decimal point ("1.2.3 MW" -> "2.3").
    const dot = m[0].indexOf(".");
    if (dot >= 0) numRe.lastIndex = m.index + dot + 1;
  }
  return null;
}

/** Numbers are parsed and compared in code. Jev is never asked whether 800 kW is "enough". */
export function parseConstraints(text: string, site: VppSite): Constraint[] {
  const out: Constraint[] = [];
  // A minimum-capacity threshold needs an explicit comparator ("a total of 12 MW" is not one).
  const cap =
    /(?:at least|≥|>=|minimum of|above|more than|over|exceeding|no less than)\s*(\d[\d,]*(?:\.\d+)?)\s*(MW|kW)\b/i.exec(text) ??
    execCapSuffix(text);
  if (cap?.[1] && cap[2]) {
    const kw = toKw(num(cap[1]), cap[2]);
    out.push({ kind: "min_capacity_kw", text: cap[0].trim(), value: kw, satisfied: site.capacity_kw >= kw });
  }
  const pct = /(?:curtail|reduce)[^.%]{0,40}?(\d{1,3})\s?%/i.exec(text);
  if (pct?.[1]) out.push({ kind: "curtail_percent", text: pct[0].trim(), value: Number(pct[1]) });
  for (const m of text.matchAll(/\b(\d{1,2}:\d{2})\s*(?:to|and|–|-)\s*(\d{1,2}:\d{2})\b/g)) out.push({ kind: "time_window", text: `${m[1]}–${m[2]}` });
  const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
  const dl = new RegExp(`\\bby\\s+(\\d{1,2}:\\d{2}(?: (?:today|tomorrow)| on ${MONTH} \\d{1,2})?|${MONTH} \\d{1,2})\\b`).exec(text);
  if (dl?.[1]) out.push({ kind: "deadline", text: dl[1] });
  const within = /\bwithin\s+(\d+\s+(?:business\s+)?(?:minutes?|hours?|days?))\b/i.exec(text);
  if (within?.[1]) out.push({ kind: "deadline", text: `within ${within[1]}` });
  return out;
}
