import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { A3_LINES, A3_PRESET_QUERIES, A3_THRESHOLDS, buildDocumentState, buildFindQuestions, composeFind, lineId } from "./index";

function answers(exists: number, spans: number, probs: Record<string, number>): Answers {
  const full: Record<string, number> = Object.fromEntries(A3_LINES.map((_, i) => [lineId(i), 0]));
  Object.assign(full, probs);
  const choice = Object.entries(full).sort((a, b) => b[1] - a[1])[0]![0];
  return {
    where: { type: "choice", choice, probabilities: full, confidence: 0.5 },
    exists: { type: "noul", noul: exists },
    spans_multiple: { type: "noul", noul: spans },
  };
}

describe("A3 semantic find", () => {
  it("builds a tagged document state with 218 lines and three valid questions with 218 options", () => {
    const state = buildDocumentState();
    const lines = state.split("\n");
    expect(lines).toHaveLength(218);
    expect(lines[0]).toMatch(/^L000\| /);
    expect(lines[217]).toMatch(/^L217\| /);
    const q = buildFindQuestions("who owns the code I upload?");
    expect(validateQuestions(q)).toEqual([]);
    expect(Object.keys(q)).toEqual(["where", "exists", "spans_multiple"]);
    const where = q.where!;
    if (where.type !== "choice") throw new Error("where must be a choice");
    expect(Object.keys(where.criteria)).toHaveLength(218);
    expect(JSON.stringify(q.exists!.instructions)).toContain("who owns the code I upload?");
    expect(A3_PRESET_QUERIES).toHaveLength(6);
  });

  it("maps exists to a status and ranks lines", () => {
    const r = composeFind(answers(0.98, 0.1, { L052: 0.9, L010: 0.05, L011: 0.02, L012: 0.03 }));
    expect(r.status).toBe("answered");
    expect(r.ranked.map((x) => x.lineId)).toEqual(["L052", "L010", "L012"]); // 0.02 is below minShow
    expect(r.ranked[0]?.text).toBe(A3_LINES[52]);
    expect(r.highlightCount).toBe(1);
    expect(composeFind(answers(0.5, 0.1, { L001: 1 })).status).toBe("partial");
    expect(composeFind(answers(0.1, 0.1, { L001: 1 })).status).toBe("absent");
    expect(composeFind(answers(0.1, 0.1, { L001: 1 })).naiveTop).toEqual({ lineId: "L001", prob: 1 });
  });

  it("highlights three lines when the answer spans several", () => {
    const r = composeFind(answers(0.9, 0.7, { L001: 0.4, L002: 0.35, L003: 0.2, L004: 0.05 }));
    expect(r.highlightCount).toBe(3);
    expect(r.ranked).toHaveLength(Math.min(A3_THRESHOLDS.topN, 4));
  });
});
