import { describe, expect, it } from "vitest";
import type { Answers, Questions } from "../../types";
import { computeArmMetrics, ratiosVsJev, topLabel, type ArmMetrics, type RunRecord } from "./metrics";

const questions: Questions = {
  cat: { type: "choice", instructions: "?", criteria: { a: null, b: null, c: null } },
  sev: { type: "score", instructions: "?", criteria: ["L0", "L1", "L2"] },
  flag: { type: "noul", instructions: "?" },
};

const rec = (run: number, answers: Answers, latencyMs = 100, costUsd = 0.00005): RunRecord => ({
  arm: "jev", run, answers, latencyMs, costUsd, inputTokens: 1000, outputTokens: 0, traceId: `t${run}`,
});
const same: Answers = {
  cat: { type: "choice", choice: "a", probabilities: { a: 0.9, b: 0.1, c: 0 }, confidence: 0.85 },
  sev: { type: "score", score: 1, probabilities: { "0": 0, "1": 1, "2": 0 }, legend: { "0": "L0", "1": "L1", "2": "L2" }, confidence: 1 },
  flag: { type: "noul", noul: 0.7 },
};

describe("topLabel", () => {
  it("maps each primitive to a label and probability", () => {
    expect(topLabel(same.cat!)).toEqual({ label: "a", prob: 0.9 });
    expect(topLabel(same.sev!)).toEqual({ label: "1", prob: 1 });
    expect(topLabel(same.flag!)).toEqual({ label: "yes", prob: 0.7 });
    expect(topLabel({ type: "noul", noul: 0.3 })).toEqual({ label: "no", prob: 0.7 });
  });
});

describe("computeArmMetrics", () => {
  it("reports perfect agreement and zero spread for identical runs", () => {
    const m = computeArmMetrics("jev", [rec(1, same), rec(2, same), rec(3, same), rec(4, same)], questions);
    expect(m.runs).toBe(4);
    expect(m.meanRawAgreement).toBe(1);
    expect(m.meanPolicyAgreement).toBe(1);
    expect(m.meanUncertainShare).toBe(0);
    expect(m.meanStd).toBe(0);
    expect(m.p50LatencyMs).toBe(100);
    expect(m.usdPerCall).toBeCloseTo(0.00005, 9);
    expect(m.questions.find((q) => q.questionId === "cat")?.modalLabel).toBe("a");
  });

  it("flags near-even choices as uncertain and measures spread", () => {
    const a: Answers = { ...same, cat: { type: "choice", choice: "a", probabilities: { a: 0.55, b: 0.45, c: 0 }, confidence: 0.1 } };
    const b: Answers = { ...same, cat: { type: "choice", choice: "b", probabilities: { a: 0.45, b: 0.55, c: 0 }, confidence: 0.1 } };
    const m = computeArmMetrics("jev", [rec(1, a), rec(2, b), rec(3, a), rec(4, b)], questions);
    const cat = m.questions.find((q) => q.questionId === "cat")!;
    expect(cat.rawAgreement).toBe(0.5);
    expect(cat.uncertainShare).toBe(1);
    expect(cat.policyAgreement).toBe(1); // all "uncertain"
    expect(cat.meanStd).toBeGreaterThan(0.03);
    const sev = m.questions.find((q) => q.questionId === "sev")!;
    expect(sev.rawAgreement).toBe(1);
  });
});

describe("ratiosVsJev", () => {
  const mk = (arm: ArmMetrics["arm"], p50: number, usd: number): ArmMetrics => ({
    arm, runs: 1, questions: [], meanRawAgreement: 1, meanPolicyAgreement: 1, meanUncertainShare: 0, meanStd: 0, meanLatencyMs: p50, p50LatencyMs: p50, totalUsd: usd, usdPerCall: usd,
  });
  it("divides each arm by the jev arm and returns nulls without jev", () => {
    const r = ratiosVsJev([mk("jev", 100, 0.00005), mk("sonnet5", 1000, 0.005)]);
    expect(r.sonnet5).toEqual({ latency: 10, cost: 100 });
    expect(r.jev).toEqual({ latency: 1, cost: 1 });
    expect(ratiosVsJev([mk("sonnet5", 1000, 0.005)]).sonnet5).toEqual({ latency: null, cost: null });
  });
});
