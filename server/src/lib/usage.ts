import type { Trace } from "@jev/shared";

export interface UsageSnapshot {
  startedAt: string;
  jev: { calls: number; cached: number; usd: number; inputTokens: number; totalLatencyMs: number };
  claude: { calls: number; usd: number; inputTokens: number; outputTokens: number; totalLatencyMs: number };
}

function fresh(): UsageSnapshot {
  return {
    startedAt: new Date().toISOString(),
    jev: { calls: 0, cached: 0, usd: 0, inputTokens: 0, totalLatencyMs: 0 },
    claude: { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 },
  };
}

/** In-memory, per-process accumulator behind GET /api/usage. */
export function createUsage() {
  let state = fresh();
  return {
    record(trace: Trace): void {
      if (trace.kind === "jev") {
        state.jev.calls += 1;
        if (trace.cached) state.jev.cached += 1;
        state.jev.usd += trace.cost.usd;
        state.jev.inputTokens += trace.response.usage.input_tokens;
        state.jev.totalLatencyMs += trace.latencyMs;
      } else {
        state.claude.calls += 1;
        state.claude.usd += trace.cost.usd;
        state.claude.inputTokens += trace.inputTokens;
        state.claude.outputTokens += trace.outputTokens;
        state.claude.totalLatencyMs += trace.latencyMs;
      }
    },
    snapshot: (): UsageSnapshot => structuredClone(state),
    reset(): void {
      state = fresh();
    },
  };
}

export const usage = createUsage();
