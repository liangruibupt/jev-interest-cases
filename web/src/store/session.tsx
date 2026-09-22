import type { Trace } from "@jev/shared";
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

interface SessionState {
  traces: Trace[];
}

type Action = { type: "add"; traces: Trace[] } | { type: "reset" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "add":
      return { traces: [...state.traces, ...action.traces] };
    case "reset":
      return { traces: [] };
  }
}

export interface SessionTotals {
  jevUsd: number;
  claudeUsd: number;
  jevCalls: number;
  jevCached: number;
  claudeCalls: number;
  avgJevLatencyMs: number;
  avgClaudeLatencyMs: number;
}

interface SessionValue {
  traces: Trace[];
  addTraces: (traces: Trace[]) => void;
  reset: () => void;
  totals: SessionTotals;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { traces: [] });
  const addTraces = useCallback((traces: Trace[]) => dispatch({ type: "add", traces }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const totals = useMemo<SessionTotals>(() => {
    const jev = state.traces.filter((t) => t.kind === "jev");
    const live = jev.filter((t) => !t.cached);
    const claude = state.traces.filter((t) => t.kind === "claude");
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      jevUsd: jev.reduce((s, t) => s + t.cost.usd, 0),
      claudeUsd: claude.reduce((s, t) => s + t.cost.usd, 0),
      jevCalls: jev.length,
      jevCached: jev.length - live.length,
      claudeCalls: claude.length,
      avgJevLatencyMs: avg(live.map((t) => t.latencyMs)),
      avgClaudeLatencyMs: avg(claude.map((t) => t.latencyMs)),
    };
  }, [state.traces]);
  const value = useMemo(() => ({ traces: state.traces, addTraces, reset, totals }), [state.traces, addTraces, reset, totals]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
