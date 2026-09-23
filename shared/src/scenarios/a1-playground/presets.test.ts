import { describe, expect, it } from "vitest";
import { validateQuestions } from "../../validate";
import { A1_LIMITS, A1_PRESETS, summarizeNouls } from "./presets";

describe("A1 presets", () => {
  it("has 7 presets with unique ids that all validate and respect the limits", () => {
    expect(A1_PRESETS).toHaveLength(7);
    expect(new Set(A1_PRESETS.map((p) => p.id)).size).toBe(7);
    for (const p of A1_PRESETS) {
      expect(validateQuestions(p.questions), p.id).toEqual([]);
      expect(Object.keys(p.questions).length).toBeLessThanOrEqual(A1_LIMITS.maxQuestions);
      expect(JSON.stringify(p.state).length).toBeLessThanOrEqual(A1_LIMITS.maxStateChars);
    }
  });

  it("preset 4 asks one Noul per item and its summary counts nouls above the threshold", () => {
    const p = A1_PRESETS.find((x) => x.id === "counting")!;
    const nouls = Object.values(p.questions).filter((q) => q.type === "noul");
    expect(nouls).toHaveLength(8);
    expect(p.summarize?.kind).toBe("count_nouls_above");
    const answers = Object.fromEntries(p.summarize!.ids.map((id, i) => [id, { type: "noul" as const, noul: i % 3 === 1 ? 0.9 : 0.1 }]));
    expect(summarizeNouls(answers, p.summarize!)).toBe(3);
  });

  it("preset 7 is the Chinese twin of preset 1 with identical questions", () => {
    const en = A1_PRESETS.find((x) => x.id === "quickstart")!;
    const zh = A1_PRESETS.find((x) => x.id === "cjk")!;
    expect(zh.questions).toEqual(en.questions);
    expect(zh.state).not.toEqual(en.state);
  });
});
