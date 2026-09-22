import { z } from "zod";
import { CLAUDE_TIERS, type Answers, type ClaudeTierId, type ClaudeTrace, type EntryType, type Question, type Questions, type ScenarioId } from "@jev/shared";
import { ClaudeStructuredOutputError, claudeParse as defaultParse, type ClaudeParseCall } from "./claude";

/**
 * TypeScript port of the idea behind TypeSafe's `system-one-adapter`: ask an LLM the same
 * Choice/Score/Noul questions and coerce its answer into Jev's response shape so A4 can compare
 * like-for-like. The LLM's probabilities are "verbalized", not sampled — the 学习卡 says so.
 */
export const SYSTEM_PROMPT = [
  "You are a calibrated decision model. Read STATE literally and answer every question in QUESTIONS.",
  "For a choice question, return a probability for each listed option; for a score question, a probability for each level index; for a noul question, the probability that the answer is yes.",
  "Each distribution must sum to 1.0 and reflect how likely each option is to be correct.",
  "Do not add options, explanations, or any text outside the required structure.",
].join(" ");

export function optionKeys(question: Question): string[] {
  switch (question.type) {
    case "choice":
      return Object.keys(question.criteria);
    case "score":
      return question.criteria.map((_, i) => String(i));
    case "noul":
      return ["yes"];
  }
}

const prob = () => z.number().min(0).max(1);

export function buildSchema(questions: Questions) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      shape[id] = z.object({ p_yes: prob() });
    } else {
      const probShape = Object.fromEntries(optionKeys(q).map((k) => [k, prob()]));
      shape[id] = z.object({ probabilities: z.object(probShape) });
    }
  }
  return z.object(shape);
}

export function buildUserMessage(state: EntryType, questions: Questions): string {
  return `STATE:\n${JSON.stringify(state, null, 2)}\n\nQUESTIONS:\n${JSON.stringify(questions, null, 2)}`;
}

export interface NormalizeDebug {
  /** |sum - 1| per question before normalization. */
  normalizationDelta: Record<string, number>;
  /** Questions whose distribution summed to 0 and were replaced by uniform. */
  degenerate: string[];
}

const clamp01 = (x: unknown): number => {
  const n = typeof x === "number" && Number.isFinite(x) ? x : 0;
  return Math.min(1, Math.max(0, n));
};

export function normalizeAnswers(raw: Record<string, unknown>, questions: Questions): { answers: Answers; debug: NormalizeDebug } {
  const answers: Answers = {};
  const debug: NormalizeDebug = { normalizationDelta: {}, degenerate: [] };
  for (const [id, q] of Object.entries(questions)) {
    const entry = (raw[id] ?? {}) as { p_yes?: unknown; probabilities?: Record<string, unknown> };
    if (q.type === "noul") {
      answers[id] = { type: "noul", noul: clamp01(entry.p_yes ?? 0.5) };
      continue;
    }
    const keys = optionKeys(q);
    const clamped = keys.map((k) => clamp01(entry.probabilities?.[k]));
    const sum = clamped.reduce((a, b) => a + b, 0);
    let normalized: number[];
    if (sum <= 0) {
      normalized = keys.map(() => 1 / keys.length);
      debug.degenerate.push(id);
      debug.normalizationDelta[id] = 1;
    } else {
      normalized = clamped.map((p) => p / sum);
      debug.normalizationDelta[id] = Math.abs(sum - 1);
    }
    const probabilities = Object.fromEntries(keys.map((k, i) => [k, normalized[i] ?? 0]));
    if (q.type === "choice") {
      const best = keys.reduce((a, b) => ((probabilities[a] ?? 0) >= (probabilities[b] ?? 0) ? a : b));
      answers[id] = { type: "choice", choice: best, probabilities, confidence: null };
    } else {
      const score = normalized.reduce((acc, p, i) => acc + p * i, 0);
      const legend = Object.fromEntries(q.criteria.map((c, i) => [String(i), c]));
      answers[id] = { type: "score", score, probabilities, legend, confidence: null } as Answers[string];
    }
  }
  return { answers, debug };
}

export interface AskLlmSystemOneInput {
  scenario: ScenarioId;
  state: EntryType;
  questions: Questions;
  tier: ClaudeTierId;
  temperature?: number;
  maxTokens?: number;
}

export interface AskLlmSystemOneOutput {
  answers: Answers;
  trace: ClaudeTrace;
  debug: NormalizeDebug & { retried: boolean };
}

type ParseFn = <T>(call: ClaudeParseCall<T>) => Promise<{ parsed: T; trace: ClaudeTrace }>;

export function createLlmSystemOne(deps: { parse: ParseFn }) {
  return async function askLlmSystemOne(input: AskLlmSystemOneInput): Promise<AskLlmSystemOneOutput> {
    const schema = buildSchema(input.questions);
    const optionCount = Object.values(input.questions).reduce((n, q) => n + optionKeys(q).length, 0);
    const tier = CLAUDE_TIERS[input.tier];
    const base: ClaudeParseCall<z.infer<typeof schema>> = {
      scenario: input.scenario,
      purpose: "llmSystemOne",
      tier: input.tier,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input.state, input.questions) }],
      maxTokens: input.maxTokens ?? 256 + 16 * optionCount,
      ...(tier.supportsEffort ? { effort: "low" as const } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      schema,
    };
    let retried = false;
    let result: { parsed: z.infer<typeof schema>; trace: ClaudeTrace };
    try {
      result = await deps.parse(base);
    } catch (err) {
      if (!(err instanceof ClaudeStructuredOutputError)) throw err;
      retried = true;
      result = await deps.parse({
        ...base,
        messages: [
          ...base.messages,
          { role: "user", content: "Your previous reply did not match the required structure. Return only the structured object with a probability for every listed option." },
        ],
      });
    }
    const { answers, debug } = normalizeAnswers(result.parsed as Record<string, unknown>, input.questions);
    return { answers, trace: result.trace, debug: { ...debug, retried } };
  };
}

export const askLlmSystemOne = createLlmSystemOne({ parse: defaultParse as ParseFn });
