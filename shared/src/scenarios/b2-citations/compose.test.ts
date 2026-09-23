import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { CANNED_CITATIONS } from "./citations";
import { B2_THRESHOLDS, stringStage, verdictFromAnswers } from "./compose";
import { RFC_SECTIONS } from "./sections";

const a = (choice: string, conf: number, quoteSupports = 0.9): Answers => ({
  relation: { type: "choice", choice, probabilities: { supports: choice === "supports" ? 0.9 : 0.05, contradicts: choice === "contradicts" ? 0.9 : 0.05, says_nothing: choice === "says_nothing" ? 0.9 : 0.05 }, confidence: conf },
  quote_supports: { type: "noul", noul: quoteSupports },
});
const c = CANNED_CITATIONS[0]!;

describe("verdictFromAnswers", () => {
  it("maps relation to verdicts and gates review on confidence", () => {
    expect(verdictFromAnswers(c, a("supports", 0.95)).verdict).toBe("verified");
    expect(verdictFromAnswers(c, a("contradicts", 0.95)).verdict).toBe("contradicted");
    expect(verdictFromAnswers(c, a("says_nothing", 0.95, 0.1)).verdict).toBe("unsupported");
    expect(verdictFromAnswers(c, a("supports", 0.79)).review).toBe(true);
    expect(verdictFromAnswers(c, a("supports", 0.8)).review).toBe(false);
    expect(B2_THRESHOLDS.autoAccept).toBe(0.8);
  });
  it("flags disagreement when the quote alone supports but the section does not", () => {
    expect(verdictFromAnswers(c, a("says_nothing", 0.9, 0.85)).disagreement).toBe(true);
    expect(verdictFromAnswers(c, a("supports", 0.9, 0.85)).disagreement).toBe(false);
  });
});

describe("stringStage over the canned citations", () => {
  it("settles fabricated and misattributed without Jev and passes the other six on", () => {
    const staged = CANNED_CITATIONS.map((x) => ({ id: x.id, expected: x.expected, r: stringStage(x, RFC_SECTIONS) }));
    const settled = staged.filter((s) => s.r !== null);
    expect(settled.map((s) => s.r!.verdict).sort()).toEqual(["fabricated", "misattributed"]);
    for (const s of settled) expect(s.r!.verdict).toBe(s.expected);
    expect(staged.filter((s) => s.r === null)).toHaveLength(6);
    const mis = staged.find((s) => s.id === "encryption_optional_misattributed")!;
    expect(mis.r?.matchedIn).toBe("8");
  });
});
