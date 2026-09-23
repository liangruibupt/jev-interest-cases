import { describe, expect, it } from "vitest";
import { FILINGS } from "../../datasets/filings";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { C3_NOT_ASKED, C3_QUESTIONS, C3_QUESTION_IDS, C3_THRESHOLDS, EVENT_TYPES, buildFilingState, extractAmounts, judgeFiling } from "./index";

type Over = Partial<{ event: string; materiality: number; conf: number; direction: string; fwd: number; hedged: number; acct: number; key: number; boiler: number }>;
function answers(o: Over = {}): Answers {
  const v = { event: "product_or_operations", materiality: 0.5, conf: 0.9, direction: "neutral", fwd: 0.1, hedged: 0.1, acct: 0.02, key: 0.02, boiler: 0.1, ...o };
  return {
    event_type: { type: "choice", choice: v.event, probabilities: { [v.event]: 1 }, confidence: v.conf },
    materiality: { type: "score", score: v.materiality, probabilities: { "0": 0, "1": 0, "2": 0, "3": 0, [String(Math.round(v.materiality))]: 1 }, legend: {}, confidence: v.conf },
    direction: { type: "choice", choice: v.direction, probabilities: { [v.direction]: 1 }, confidence: 0.9 },
    is_forward_looking: { type: "noul", noul: v.fwd },
    hedged_language: { type: "noul", noul: v.hedged },
    accounting_or_controls: { type: "noul", noul: v.acct },
    key_person: { type: "noul", noul: v.key },
    boilerplate: { type: "noul", noul: v.boiler },
  };
}

describe("C3 dataset and questions", () => {
  it("has 15 labelled filings and 8 valid questions", () => {
    expect(FILINGS).toHaveLength(15);
    expect(new Set(FILINGS.map((f) => f.id)).size).toBe(15);
    expect(FILINGS.filter((f) => f.expected.lanes[0] === "read_now").length).toBeGreaterThanOrEqual(4);
    expect(FILINGS.filter((f) => f.expected.lanes[0] === "archive").length).toBeGreaterThanOrEqual(3);
    expect(validateQuestions(C3_QUESTIONS)).toEqual([]);
    expect(Object.keys(C3_QUESTIONS)).toEqual([...C3_QUESTION_IDS]);
    const ev = C3_QUESTIONS.event_type!;
    if (ev.type !== "choice") throw new Error("event_type must be a choice");
    expect(Object.keys(ev.criteria)).toEqual([...EVENT_TYPES]);
    const mat = C3_QUESTIONS.materiality!;
    if (mat.type !== "score") throw new Error("materiality must be a score");
    expect(mat.criteria).toHaveLength(4);
    expect(C3_NOT_ASKED.length).toBeGreaterThanOrEqual(3);
    expect(buildFilingState(FILINGS[0]!).headline).toBe(FILINGS[0]!.headline);
  });
});

describe("C3 amounts (display only)", () => {
  it("extracts dollar amounts and percentages, ignoring plain numbers", () => {
    expect(extractAmounts("guidance to $3.55 to $3.65 from $4.15 to $4.25").map((a) => a.text)).toEqual(["$3.55", "$3.65", "$4.15", "$4.25"]);
    expect(extractAmounts("acquire Ferrotek for $1.2 billion, a 31% premium")).toEqual([{ text: "$1.2 billion", kind: "usd" }, { text: "31%", kind: "percent" }]);
    expect(extractAmounts("approximately 22% of revenue in fiscal 2026")).toEqual([{ text: "22%", kind: "percent" }]);
    expect(extractAmounts("held on September 12 with nine directors")).toEqual([]);
  });
});

describe("C3 reading lanes", () => {
  const t = C3_THRESHOLDS;
  it("accounting issues always surface; materiality bands are inclusive at the documented boundaries", () => {
    expect(judgeFiling(answers({ acct: 0.7, materiality: 0.2 }), "x", t)).toMatchObject({ lane: "read_now", ruleId: "accounting" });
    expect(judgeFiling(answers({ materiality: 1.8 }), "x", t)).toMatchObject({ lane: "read_now", ruleId: "materiality_high" });
    expect(judgeFiling(answers({ materiality: 1.79 }), "x", t)).toMatchObject({ lane: "today", ruleId: "materiality_mid" });
    expect(judgeFiling(answers({ materiality: 1.1 }), "x", t).lane).toBe("today");
    expect(judgeFiling(answers({ materiality: 1.09 }), "x", t)).toMatchObject({ lane: "archive", ruleId: "low" });
  });
  it("key-person departures with negative direction, boilerplate sinking, hedged lifting", () => {
    expect(judgeFiling(answers({ key: 0.7, direction: "negative", materiality: 1.5 }), "x", t)).toMatchObject({ lane: "read_now", ruleId: "key_person_negative" });
    expect(judgeFiling(answers({ key: 0.7, direction: "neutral", materiality: 1.5 }), "x", t).lane).toBe("today");
    expect(judgeFiling(answers({ boiler: 0.7, materiality: 1.0 }), "x", t)).toMatchObject({ lane: "archive", ruleId: "boilerplate" });
    expect(judgeFiling(answers({ boiler: 0.9, materiality: 1.3 }), "x", t).lane).toBe("today"); // substantive despite boilerplate
    expect(judgeFiling(answers({ hedged: 0.6, materiality: 0.8 }), "x", t)).toMatchObject({ lane: "today", ruleId: "hedged" });
    expect(judgeFiling(answers({ hedged: 0.6, materiality: 0.79 }), "x", t).lane).toBe("archive");
    const j = judgeFiling(answers({ acct: 0.8, key: 0.75, hedged: 0.65, fwd: 0.7, boiler: 0.7 }), "$85 million, 38%", t);
    expect(j.flags).toEqual(["accounting", "key_person", "hedged", "forward_looking", "boilerplate"]);
    expect(j.amounts.map((a) => a.text)).toEqual(["$85 million", "38%"]);
  });
});
