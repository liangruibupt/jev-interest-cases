import { normalizeText } from "../../util/normalizeText";
import type { RfcSection } from "./sections";

export interface MatchResult {
  found: boolean;
  /** Index into the normalized section text (for highlighting after re-normalizing the section). */
  index?: number;
}

/** Substring search over normalized text so wrapped lines, page breaks and typography do not matter. */
export function locateQuote(quote: string, section: RfcSection): MatchResult {
  const q = normalizeText(quote);
  if (!q) return { found: false };
  const idx = normalizeText(section.text).indexOf(q);
  return idx >= 0 ? { found: true, index: idx } : { found: false };
}

/** Which section (if any) actually contains the quote. */
export function findQuoteAnywhere(quote: string, sections: RfcSection[]): string | undefined {
  return sections.find((s) => locateQuote(quote, s).found)?.id;
}
