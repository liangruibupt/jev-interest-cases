import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { A2_SPAM_WEIGHTS, A2_THRESHOLDS, compose } from "./compose";

interface Fixture {
  dept?: Record<string, number>;
  conf?: number;
  nouls?: Partial<Record<"has_repro_steps" | "refund_requested" | "requests_credentials" | "sender_identity_mismatch" | "unexpected_reward" | "mentions_open_order", number>>;
  frustration?: number;
  severity?: number;
  resolution?: string;
}

function answers(f: Fixture = {}): Answers {
  const dept = f.dept ?? { billing: 0.9, orders: 0.05, account: 0.05, technical: 0, other: 0 };
  const choice = Object.entries(dept).sort((a, b) => b[1] - a[1])[0]![0];
  const noul = (id: keyof NonNullable<Fixture["nouls"]>, d = 0.05) => ({ type: "noul" as const, noul: f.nouls?.[id] ?? d });
  const score = (v: number, legend: string[]) => {
    const probabilities: Record<string, number> = {};
    legend.forEach((_, i) => (probabilities[String(i)] = i === Math.round(v) ? 1 : 0));
    return { type: "score" as const, score: v, probabilities, legend: Object.fromEntries(legend.map((l, i) => [String(i), l])), confidence: 1 };
  };
  return {
    department: { type: "choice", choice, probabilities: dept, confidence: f.conf ?? 0.9 },
    requested_resolution: { type: "choice", choice: f.resolution ?? "information", probabilities: { [f.resolution ?? "information"]: 1 }, confidence: 1 },
    bug_severity: score(f.severity ?? 0, ["Cosmetic", "Degraded", "Blocking"]),
    has_repro_steps: noul("has_repro_steps"),
    refund_requested: noul("refund_requested"),
    requests_credentials: noul("requests_credentials"),
    sender_identity_mismatch: noul("sender_identity_mismatch"),
    unexpected_reward: noul("unexpected_reward"),
    mentions_open_order: noul("mentions_open_order"),
    frustration: score(f.frustration ?? 0, ["Calm", "Frustrated", "Angry"]),
  };
}

describe("compose", () => {
  it("routes a clear billing ticket to billing with a refund badge", () => {
    const d = compose(answers({ nouls: { refund_requested: 0.8 } }));
    expect(d.lane).toBe("billing");
    expect(d.badges).toContain("refund");
    expect(d.usedQuestionIds).toContain("refund_requested");
    expect(d.usedQuestionIds).not.toContain("bug_severity");
  });

  it("quarantines when weighted spam risk reaches the block threshold", () => {
    // 0.45*0.9 + 0.3*0.6 + 0.25*0.2 = 0.635
    const d = compose(answers({ nouls: { requests_credentials: 0.9, sender_identity_mismatch: 0.6, unexpected_reward: 0.2 } }));
    expect(d.spamRisk).toBeCloseTo(0.635, 3);
    expect(d.lane).toBe("quarantine");
  });

  it("sends the spam grey band to review", () => {
    // 0.45*0.9 + 0.3*0.2 + 0.25*0 = 0.465
    const d = compose(answers({ nouls: { requests_credentials: 0.9, sender_identity_mismatch: 0.2, unexpected_reward: 0 } }));
    expect(d.spamRisk).toBeCloseTo(0.465, 3);
    expect(d.lane).toBe("review");
  });

  it("gates on department confidence at the threshold boundary", () => {
    expect(compose(answers({ conf: 0.59 })).lane).toBe("review");
    expect(compose(answers({ conf: 0.61 })).lane).toBe("billing");
    expect(compose(answers({ conf: 0.6 })).lane).toBe("billing");
  });

  it("routes `other` to review", () => {
    expect(compose(answers({ dept: { billing: 0.1, orders: 0.1, account: 0.1, technical: 0.1, other: 0.6 }, conf: 0.9 })).lane).toBe("review");
  });

  it("cc's a second team above the probability threshold only", () => {
    expect(compose(answers({ dept: { billing: 0.6, orders: 0.26, account: 0.14, technical: 0, other: 0 } })).ccTeams).toEqual(["orders"]);
    expect(compose(answers({ dept: { billing: 0.6, orders: 0.24, account: 0.16, technical: 0, other: 0 } })).ccTeams).toEqual([]);
  });

  it("uses bug severity in priority only for technical tickets", () => {
    const tech = compose(answers({ dept: { technical: 0.95, billing: 0.05, orders: 0, account: 0, other: 0 }, severity: 2, frustration: 1 }));
    const bill = compose(answers({ severity: 2, frustration: 1 }));
    expect(tech.priority).toBeCloseTo(0.5 * 0.5 + 0.5 * 1, 6);
    expect(bill.priority).toBeCloseTo(0.5 * 0.5, 6);
    expect(tech.badges).toContain("blocking");
    expect(tech.usedQuestionIds).toContain("bug_severity");
  });

  it("marks angry, repro and open-order badges at their thresholds", () => {
    const d = compose(answers({ dept: { technical: 0.9, billing: 0.1, orders: 0, account: 0, other: 0 }, frustration: 1.5, nouls: { has_repro_steps: 0.6 } }));
    expect(d.badges).toEqual(expect.arrayContaining(["angry", "repro"]));
    const o = compose(answers({ dept: { orders: 0.9, billing: 0.1, account: 0, technical: 0, other: 0 }, nouls: { mentions_open_order: 0.7 } }));
    expect(o.badges).toContain("open_order");
    expect(o.usedQuestionIds).toContain("mentions_open_order");
  });

  it("re-routes when thresholds change without new answers", () => {
    const a = answers({ conf: 0.7 });
    expect(compose(a).lane).toBe("billing");
    expect(compose(a, { ...A2_THRESHOLDS, deptMinConfidence: 0.8 }).lane).toBe("review");
    expect(compose(a, A2_THRESHOLDS, { ...A2_SPAM_WEIGHTS, requests_credentials: 0 }).spamRisk).toBeLessThan(0.05);
  });
});
