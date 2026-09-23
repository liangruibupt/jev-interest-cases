import type { Questions } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { ClaudeStructuredOutputError } from "./claude";
import { MAX_CORRECTIVE_RETRIES, buildSchema, buildUserMessage, createLlmSystemOne, normalizeAnswers, optionKeys } from "./llmSystemOne";

const questions: Questions = {
  dept: { type: "choice", instructions: "Which team?", criteria: { billing: null, tech: "Bugs", sales: null } },
  sev: { type: "score", instructions: "How severe?", criteria: ["Cosmetic", "Degraded", "Blocking"] },
  urgent: { type: "noul", instructions: "Urgent?" },
};

describe("llmSystemOne", () => {
  it("lists option keys per primitive", () => {
    expect(optionKeys(questions.dept!)).toEqual(["billing", "tech", "sales"]);
    expect(optionKeys(questions.sev!)).toEqual(["0", "1", "2"]);
    expect(optionKeys(questions.urgent!)).toEqual(["yes"]);
  });

  it("builds a schema that accepts well-formed output and rejects extra options", () => {
    const schema = buildSchema(questions);
    const good = {
      dept: { probabilities: { billing: 0.7, tech: 0.2, sales: 0.1 } },
      sev: { probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 } },
      urgent: { p_yes: 0.9 },
    };
    expect(schema.safeParse(good).success).toBe(true);
    const bad = { ...good, dept: { probabilities: { billing: 1, other: 0 } } };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("normalizes distributions, records deltas, and derives choice/score/noul", () => {
    const { answers, debug } = normalizeAnswers(
      {
        dept: { probabilities: { billing: 0.9, tech: 0.3, sales: 0 } }, // sums to 1.2
        sev: { probabilities: { "0": 0, "1": 0, "2": 0 } }, // degenerate
        urgent: { p_yes: 1.4 }, // clamped
      },
      questions,
    );
    const dept = answers.dept!;
    expect(dept.type).toBe("choice");
    if (dept.type === "choice") {
      expect(dept.choice).toBe("billing");
      expect(dept.probabilities.billing).toBeCloseTo(0.75, 6);
      expect(dept.confidence).toBeNull();
    }
    expect(debug.normalizationDelta.dept).toBeCloseTo(0.2, 6);
    const sev = answers.sev!;
    if (sev.type === "score") {
      expect(sev.probabilities).toEqual({ "0": 1 / 3, "1": 1 / 3, "2": 1 / 3 });
      expect(sev.score).toBeCloseTo(1, 6);
      expect(sev.legend["1"]).toBe("Degraded");
    }
    expect(debug.degenerate).toEqual(["sev"]);
    const urgent = answers.urgent!;
    if (urgent.type === "noul") expect(urgent.noul).toBe(1);
  });

  it("includes state and questions verbatim in the user message", () => {
    const msg = buildUserMessage({ text: "hi" }, questions);
    expect(msg).toContain("STATE:");
    expect(msg).toContain('"text": "hi"');
    expect(msg).toContain("Which team?");
  });

  it("asks Claude once with a low-effort structured call and returns answers + trace", async () => {
    const parse = vi.fn(async (_call: unknown) => ({
      parsed: {
        dept: { probabilities: { billing: 1, tech: 0, sales: 0 } },
        sev: { probabilities: { "0": 0, "1": 1, "2": 0 } },
        urgent: { p_yes: 0.2 },
      },
      trace: { kind: "claude" as const, id: "c", scenario: "a4" as const, purpose: "llmSystemOne", startedAt: "", latencyMs: 900, tier: "standard" as const, model: "m", inputTokens: 500, outputTokens: 80, cost: { usd: 0.0018 }, stopReason: "end_turn" },
    }));
    const ask = createLlmSystemOne({ parse: parse as never });
    const out = await ask({ scenario: "a4", state: "s", questions, tier: "standard" });
    expect(out.answers.dept?.type).toBe("choice");
    expect(out.trace.latencyMs).toBe(900);
    const call = parse.mock.calls[0]?.[0] as { effort?: string; maxTokens?: number; tier?: string };
    expect(call.effort).toBe("low");
    expect(call.tier).toBe("standard");
    expect(call.maxTokens).toBe(256 + 16 * 7);
  });
});

describe("llmSystemOne corrective retries", () => {
  it("re-asks with the validation error up to MAX_CORRECTIVE_RETRIES times and then succeeds", async () => {
    const good = { dept: { probabilities: { billing: 1, tech: 0, sales: 0 } }, sev: { probabilities: { "0": 1, "1": 0, "2": 0 } }, urgent: { p_yes: 0.2 } };
    const trace = { kind: "claude" as const, id: "c", scenario: "a4" as const, purpose: "llmSystemOne", startedAt: "", latencyMs: 1, tier: "strong" as const, model: "m", inputTokens: 1, outputTokens: 1, cost: { usd: 0 }, stopReason: "tool_use" };
    let calls = 0;
    const parse = vi.fn(async (call: { messages: unknown[] }) => {
      calls += 1;
      if (calls <= 2) throw new ClaudeStructuredOutputError("工具输入不符合 schema：review_path expected object, received string", null);
      expect(call.messages).toHaveLength(3); // original + two corrections
      return { parsed: good, trace };
    });
    const ask = createLlmSystemOne({ parse: parse as never });
    const out = await ask({ scenario: "a4", state: "s", questions, tier: "strong" });
    expect(out.debug.retried).toBe(2);
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retries are exhausted", async () => {
    const parse = vi.fn(async (_call: unknown) => {
      throw new ClaudeStructuredOutputError("bad", null);
    });
    const ask = createLlmSystemOne({ parse: parse as never });
    await expect(ask({ scenario: "a4", state: "s", questions, tier: "strong" })).rejects.toBeInstanceOf(ClaudeStructuredOutputError);
    expect(parse).toHaveBeenCalledTimes(1 + MAX_CORRECTIVE_RETRIES);
  });
});
