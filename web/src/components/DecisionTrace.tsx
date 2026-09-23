import { B1_QUESTIONS, B1_RULES, ROUTE_LABELS_ZH, type Answers, type B1Decision, type Trace } from "@jev/shared";
import { zh } from "../i18n/zh";
import { fmtMs, fmtUsd } from "../lib/format";
import { ConfidenceRing } from "./ConfidenceRing";
import { NoulMeter } from "./NoulMeter";
import { ProbBars } from "./ProbBars";
import { ScoreLine } from "./ScoreLine";

export interface B1Baseline {
  allOpusUsd: number;
  sonnetGuardUsd: number;
  actualClaudeUsd: number;
}

export function DecisionTrace({ answers, decision, traces, baseline }: { answers: Answers; decision: B1Decision; traces: Trace[]; baseline: B1Baseline }) {
  const jev = traces.find((t) => t.kind === "jev");
  const claude = traces.find((t) => t.kind === "claude");
  const intent = answers.intent;
  const complexity = answers.complexity;
  const severity = answers.severity;
  const noul = (id: string) => {
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };
  const instr = (id: string) => {
    const q = B1_QUESTIONS[id as keyof typeof B1_QUESTIONS];
    return typeof q?.instructions === "string" ? q.instructions : JSON.stringify(q?.instructions ?? "");
  };
  return (
    <div className="space-y-4">
      <section className="hairline rounded-md bg-panel p-4">
        <div className="mb-2 font-display text-sm">{zh.b1.hazards}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["jailbreak", "harmful_request", "medical_advice", "self_harm"] as const).map((id) => (
            <div key={id}>
              <div className="num mb-1 text-[11px] text-ink-3" title={instr(id)}>
                {id}
              </div>
              <NoulMeter value={noul(id)} no={0.35} yes={0.7} />
            </div>
          ))}
        </div>
        {severity && severity.type === "score" && (
          <div className="mt-3">
            <div className="num mb-1 text-[11px] text-ink-3">severity</div>
            <ScoreLine score={severity.score} legend={severity.legend as Record<string, unknown>} probabilities={severity.probabilities as Record<string, number>} />
          </div>
        )}
      </section>

      <section className="hairline grid gap-4 rounded-md bg-panel p-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-sm">{zh.b1.intent}</span>
            {intent && intent.type === "choice" && <ConfidenceRing value={intent.confidence} />}
          </div>
          {intent && intent.type === "choice" && <ProbBars probabilities={intent.probabilities} chosen={intent.choice} />}
        </div>
        <div>
          <div className="mb-2 font-display text-sm">{zh.b1.complexity}</div>
          {complexity && complexity.type === "score" && <ScoreLine score={complexity.score} legend={complexity.legend as Record<string, unknown>} probabilities={complexity.probabilities as Record<string, number>} />}
        </div>
      </section>

      <section className="hairline rounded-md bg-panel p-4">
        <div className="mb-2 font-display text-sm">{zh.b1.rules}</div>
        <ol className="space-y-1 text-xs">
          {B1_RULES.map((r, i) => {
            const fired = r.id === decision.ruleId;
            const skipped = B1_RULES.findIndex((x) => x.id === decision.ruleId) > i;
            return (
              <li key={r.id} className={`flex gap-2 rounded-sm px-2 py-1 ${fired ? "bg-jev-soft text-ink" : skipped ? "text-ink-3 line-through decoration-rule" : "text-ink-3/60"}`}>
                <span className="num w-4">{i + 1}</span>
                <span className="flex-1">{r.zh}</span>
                {fired && <span className="num text-jev">→ {ROUTE_LABELS_ZH[decision.route]}</span>}
              </li>
            );
          })}
        </ol>
        <ul className="num mt-2 list-disc pl-6 text-[11px] text-ink-2">
          {decision.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="hairline grid gap-4 rounded-md bg-panel p-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 font-display text-sm">{zh.b1.timing}</div>
          <div className="num flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-sm bg-jev-soft px-1.5 py-0.5 text-jev">Jev {jev ? (jev.cached ? "缓存" : fmtMs(jev.latencyMs)) : "—"}</span>
            <span className="text-ink-3">→ 策略 &lt; 1 ms →</span>
            {claude ? <span className="rounded-sm bg-claude-soft px-1.5 py-0.5 text-claude">Claude {fmtMs(claude.latencyMs)}</span> : <span className="text-ink-3">无生成</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 font-display text-sm">{zh.b1.costs}</div>
          <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-ink-2">
            <dt className="text-ink-3">{zh.b1.jev}</dt>
            <dd className="text-jev">{fmtUsd(jev?.cost.usd ?? 0)}</dd>
            <dt className="text-ink-3">{zh.b1.claude}</dt>
            <dd className="text-claude">{fmtUsd(baseline.actualClaudeUsd)}</dd>
            <dt className="text-ink-3">{zh.b1.baselineOpus}</dt>
            <dd>{fmtUsd(baseline.allOpusUsd)}</dd>
            <dt className="text-ink-3">{zh.b1.baselineGuard}</dt>
            <dd>{fmtUsd(baseline.sonnetGuardUsd)}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
