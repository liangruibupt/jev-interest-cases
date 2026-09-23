import type {
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import type { ClaudeTierId } from "./pricing";

export type {
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
};

/**
 * Answers as stored in traces. Same shape as the SDK responses except that `confidence`
 * may be `null` for answers produced by the LLM adapter (Jev's confidence formula is
 * unpublished, so the adapter does not fabricate one).
 */
export type ChoiceAnswer = Omit<ChoiceResponse, "confidence"> & { confidence: number | null };
export type ScoreAnswer = Omit<ScoreResponse, "confidence"> & { confidence: number | null };
export type NoulAnswer = NoulResponse;
export type AnyAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;
export type Answers = Record<string, AnyAnswer>;

export type ScenarioId = "p0" | "a1" | "a2" | "a3" | "a4" | "b1" | "b2" | "b3" | "b4" | "c1" | "c2" | "c3" | "c4";

export interface JevTrace {
  kind: "jev";
  id: string;
  scenario: ScenarioId;
  startedAt: string;
  /** Wall-clock latency of the real call; 0 when served from cache. */
  latencyMs: number;
  cached: boolean;
  /** Latency of the original call when this trace was served from cache. */
  originalLatencyMs?: number;
  /** Versioned model that answered, e.g. "jev-1.13.0". */
  model: string;
  request: { state: EntryType; questions: Questions; model: string };
  response: { answers: Answers; usage: { input_tokens: number; output_tokens: number } };
  /** Money actually spent by this call (0 when cached). */
  cost: { usd: number };
}

export interface ClaudeTrace {
  kind: "claude";
  id: string;
  scenario: ScenarioId;
  /** Free-text tag such as "generate_answer" or "llmSystemOne". */
  purpose: string;
  startedAt: string;
  latencyMs: number;
  tier: ClaudeTierId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: { usd: number };
  stopReason: string | null;
  /** How structured output was obtained on this endpoint (claudeParse only). */
  structuredMode?: "format" | "tool" | "tool-lax";
}

export type Trace = JevTrace | ClaudeTrace;

export interface BaselineEstimate {
  scenario: ScenarioId;
  tier: ClaudeTierId;
  tierLabel: string;
  calls: number;
  inputTokens: number;
  /** Assumed LLM output tokens (Jev's output is free, an LLM must generate JSON/text). */
  outputTokens: number;
  /** What the same work would cost on the LLM tier. */
  llmUsd: number;
  /** What Jev costs for the same tokens (computed from tokens, so cached replays still compare fairly). */
  jevUsd: number;
  /** llmUsd / jevUsd; null when jevUsd is 0. */
  ratio: number | null;
  /** (1 - jevUsd / llmUsd) * 100 */
  savingsPct: number;
  assumption: { title_zh: string; outputTokensPerCall: number; note_zh: string };
}
