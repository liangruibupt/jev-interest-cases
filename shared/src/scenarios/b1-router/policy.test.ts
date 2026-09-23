import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { B1_POLICIES, decide } from "./policy";

interface F {
  intent?: string;
  intentConf?: number;
  faqTopic?: string;
  faqConf?: number;
  complexity?: number;
  jailbreak?: number;
  harmful?: number;
  medical?: number;
  selfHarm?: number;
  severity?: number;
  wantsHuman?: number;
}

function answers(f: F = {}): Answers {
  const intent = f.intent ?? "product_question";
  const topic = f.faqTopic ?? "none";
  const score = (v: number, n: number) => ({ type: "score" as const, score: v, probabilities: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === Math.round(v) ? 1 : 0])), legend: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), `L${i}`])), confidence: 1 });
  return {
    intent: { type: "choice", choice: intent, probabilities: { [intent]: 0.9, other: 0.1 }, confidence: f.intentConf ?? 0.9 },
    faq_topic: { type: "choice", choice: topic, probabilities: { [topic]: 0.9, none: 0.1 }, confidence: f.faqConf ?? 0.9 },
    complexity: score(f.complexity ?? 0.5, 3),
    jailbreak: { type: "noul", noul: f.jailbreak ?? 0.02 },
    harmful_request: { type: "noul", noul: f.harmful ?? 0.02 },
    medical_advice: { type: "noul", noul: f.medical ?? 0.02 },
    self_harm: { type: "noul", noul: f.selfHarm ?? 0.01 },
    severity: score(f.severity ?? 0, 4),
    wants_human: { type: "noul", noul: f.wantsHuman ?? 0.05 },
    is_compound: { type: "noul", noul: 0.05 },
  };
}
const strict = B1_POLICIES.strict;
const permissive = B1_POLICIES.permissive;

describe("decide", () => {
  it("routes self-harm to support before anything else", () => {
    const d = decide(answers({ selfHarm: 0.7, jailbreak: 0.9 }), strict);
    expect(d.route).toBe("support");
    expect(d.ruleId).toBe("self_harm");
  });
  it("blocks jailbreaks and harmful requests at the act threshold", () => {
    expect(decide(answers({ jailbreak: 0.7 }), strict).route).toBe("block");
    expect(decide(answers({ jailbreak: 0.69 }), strict).route).not.toBe("block");
    expect(decide(answers({ harmful: 0.7 }), strict).route).toBe("block");
  });
  it("permissive lets a 0.75 jailbreak through where strict blocks", () => {
    expect(decide(answers({ jailbreak: 0.75 }), strict).route).toBe("block");
    expect(decide(answers({ jailbreak: 0.75 }), permissive).route).toBe("sonnet");
  });
  it("blocks on high severity when any hazard is at least in review", () => {
    expect(decide(answers({ severity: 2, medical: 0.35 }), strict).route).toBe("block");
    expect(decide(answers({ severity: 2, medical: 0.2 }), strict).route).toBe("sonnet");
  });
  it("hands off to a human when asked or when intent is unclear", () => {
    expect(decide(answers({ wantsHuman: 0.8 }), strict).route).toBe("human");
    expect(decide(answers({ intentConf: 0.49 }), strict).route).toBe("human");
    expect(decide(answers({ intentConf: 0.5 }), strict).route).toBe("sonnet");
  });
  it("routes medical dosage questions to Sonnet with caution", () => {
    const d = decide(answers({ medical: 0.7 }), strict);
    expect(d.route).toBe("sonnet_caution");
    expect(d.tier).toBe("standard");
  });
  it("answers simple FAQ deterministically only with a confident topic", () => {
    const d = decide(answers({ intent: "faq", faqTopic: "hours", faqConf: 0.9, complexity: 0.3 }), strict);
    expect(d.route).toBe("deterministic");
    expect(d.faqTopic).toBe("hours");
    expect(decide(answers({ intent: "faq", faqTopic: "hours", faqConf: 0.5, complexity: 0.3 }), strict).route).toBe("sonnet");
    expect(decide(answers({ intent: "faq", faqTopic: "none", faqConf: 0.9, complexity: 0.3 }), strict).route).toBe("sonnet");
    expect(decide(answers({ intent: "faq", faqTopic: "hours", faqConf: 0.9, complexity: 1.2 }), strict).route).toBe("sonnet");
  });
  it("escalates complex complaints to a human and complex requests to Opus", () => {
    expect(decide(answers({ intent: "complaint", complexity: 1.0 }), strict).route).toBe("human");
    expect(decide(answers({ intent: "complaint", complexity: 0.5 }), strict).route).toBe("sonnet");
    const d = decide(answers({ intent: "technical_help", complexity: 1.3 }), strict);
    expect(d.route).toBe("opus");
    expect(d.tier).toBe("strong");
    expect(decide(answers({ intent: "technical_help", complexity: 1.29 }), strict).route).toBe("sonnet");
  });
  it("explains itself", () => {
    const d = decide(answers({ intent: "chit_chat" }), strict);
    expect(d.route).toBe("sonnet");
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.rule_zh).toBeTruthy();
    expect(d.hazards.jailbreak).toBeCloseTo(0.02);
  });
});
