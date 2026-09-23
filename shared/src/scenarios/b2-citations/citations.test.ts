import { describe, expect, it } from "vitest";
import { validateQuestions } from "../../validate";
import { CANNED_CITATIONS } from "./citations";
import { B2_QUESTIONS } from "./questions";
import { RFC_SECTIONS } from "./sections";

describe("B2 canned citations and questions", () => {
  it("has 8 unique citations pointing at real sections with the planned verdict mix", () => {
    expect(CANNED_CITATIONS).toHaveLength(8);
    expect(new Set(CANNED_CITATIONS.map((c) => c.id)).size).toBe(8);
    for (const c of CANNED_CITATIONS) expect(RFC_SECTIONS.some((s) => s.id === c.section_id), c.id).toBe(true);
    const counts = CANNED_CITATIONS.reduce<Record<string, number>>((m, c) => ({ ...m, [c.expected]: (m[c.expected] ?? 0) + 1 }), {});
    expect(counts).toEqual({ verified: 4, contradicted: 1, fabricated: 1, unsupported: 1, misattributed: 1 });
  });
  it("questions validate", () => {
    expect(validateQuestions(B2_QUESTIONS)).toEqual([]);
    expect(Object.keys(B2_QUESTIONS)).toEqual(["relation", "quote_supports"]);
  });
});
