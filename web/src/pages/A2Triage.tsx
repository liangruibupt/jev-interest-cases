import {
  A2_QUESTIONS,
  A2_QUESTION_IDS,
  A2_SLIDERS,
  A2_SPAM_WEIGHTS,
  A2_THRESHOLDS,
  A2_WEIGHT_SLIDERS,
  LANE_LABELS_ZH,
  TICKETS,
  compose,
  type A2Thresholds,
  type Answers,
  type JevTrace,
  type Lane,
  type SpamWeights,
} from "@jev/shared";
import { useMemo, useState } from "react";
import { AnswerCard } from "../components/AnswerCard";
import { LearningCard } from "../components/LearningCard";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { ThresholdSlider } from "../components/ThresholdSlider";
import { TicketCard } from "../components/TicketCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtMs, fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface A2Response {
  results: Record<string, { answers: Answers; traceId: string }>;
  traces: JevTrace[];
  model: string | null;
}

const LANES: Lane[] = ["billing", "orders", "account", "technical", "review", "quarantine"];

const LEARNING = {
  proves: [
    "Speculative fan-out：每条工单一次请求 10 题，其中 bug_severity / has_repro_steps / mentions_open_order 等只在特定泳道才被代码消费，其余答案直接忽略。",
    "Confidence-gated routing：部门置信度不足或垃圾风险落在灰区的工单进入人工复核，而不是硬猜。",
    "判断即数据：阈值和权重是代码常量，拖动滑杆重排 24 条工单是零推理、零成本的。",
  ],
  tryThis: [
    "把\"部门置信度门限\"拉到 0.9，看人工复核泳道暴涨——这是在用确定性换人工成本。",
    "把\"垃圾风险隔离线\"降到 0.4，观察哪些正常工单被误隔离。",
    "把\"索要凭证\"权重调到 0，看两条钓鱼工单是否还能被隔离。",
    "点开 T23 或 T24，看跨部门工单的概率如何分散、以及\"抄送\"是怎么来的。",
  ],
  pitfalls: [
    "阈值只是起点：真正的门限要用你自己的工单和后果来定。",
    "Noul 上调好的阈值不能搬到 Choice；加权和是策略不是模型。",
    "10 题一次请求的成本仍随工单数线性增长；重排不花钱，重新推理才花钱。",
  ],
};

export function A2Triage() {
  const { addTraces } = useSession();
  const [results, setResults] = useState<A2Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<A2Thresholds>(A2_THRESHOLDS);
  const [weights, setWeights] = useState<SpamWeights>(A2_SPAM_WEIGHTS);
  const [recomputes, setRecomputes] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<A2Response>("/api/a2/evaluate", { live });
      setResults(res);
      addTraces(res.traces);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const decisions = useMemo(() => {
    if (!results) return null;
    return Object.fromEntries(TICKETS.map((t) => [t.id, results.results[t.id] ? compose(results.results[t.id]!.answers, thresholds, weights) : null]));
  }, [results, thresholds, weights]);

  const byLane = useMemo(() => {
    const m = new Map<Lane, string[]>(LANES.map((l) => [l, []]));
    if (decisions) {
      for (const t of TICKETS) {
        const d = decisions[t.id];
        if (d) m.get(d.lane)!.push(t.id);
      }
      for (const ids of m.values()) ids.sort((a, b) => (decisions[b]?.priority ?? 0) - (decisions[a]?.priority ?? 0));
    }
    return m;
  }, [decisions]);

  const totals = useMemo(() => {
    if (!results) return null;
    const t = results.traces;
    return {
      n: t.length,
      latency: t.reduce((s, x) => s + (x.cached ? (x.originalLatencyMs ?? 0) : x.latencyMs), 0),
      tokens: t.reduce((s, x) => s + x.response.usage.input_tokens, 0),
      usd: t.reduce((s, x) => s + x.cost.usd, 0),
      cached: t.filter((x) => x.cached).length,
    };
  }, [results]);

  const updateThreshold = (key: keyof A2Thresholds, v: number) => {
    setThresholds((t) => ({ ...t, [key]: v }));
    setRecomputes((n) => n + 1);
  };
  const updateWeight = (key: keyof SpamWeights, v: number) => {
    setWeights((w) => ({ ...w, [key]: v }));
    setRecomputes((n) => n + 1);
  };

  const selectedTicket = selected ? TICKETS.find((t) => t.id === selected) : undefined;
  const selectedAnswers = selected && results ? results.results[selected]?.answers : undefined;
  const selectedDecision = selected && decisions ? decisions[selected] : undefined;
  const selectedTrace = selected && results ? results.traces.find((t) => t.id === results.results[selected]?.traceId) : undefined;

  return (
    <div className="rise mx-auto max-w-[96rem]">
      <header className="mb-4">
        <h1 className="font-display text-2xl">{zh.a2.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.a2.intro}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void run()} className="rounded-md bg-jev px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy ? zh.a2.running : zh.a2.runAll}
        </button>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {zh.a2.live}
        </label>
        {totals && (
          <span className="num ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-2">
            <span>
              {zh.a2.summary} {totals.n} {zh.a2.requests}
              {totals.cached ? `（${totals.cached} 缓存）` : ""}
            </span>
            <span>
              {zh.a2.totalLatency} {fmtMs(totals.latency)}
            </span>
            <span>
              {zh.a2.tokens} {totals.tokens}
            </span>
            <span>
              {zh.a2.cost} {fmtUsd(totals.usd)}
            </span>
            {results?.model && <span className="text-ink-3">{results.model}</span>}
          </span>
        )}
      </div>
      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-4">
          {!results ? (
            <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.a2.empty}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-6">
              {LANES.map((lane) => {
                const ids = byLane.get(lane) ?? [];
                return (
                  <section key={lane} className="min-w-0">
                    <div className={`mb-2 flex items-baseline justify-between border-b-2 pb-1 ${lane === "quarantine" ? "border-bad" : lane === "review" ? "border-warn" : "border-jev"}`}>
                      <span className="text-sm font-medium">{LANE_LABELS_ZH[lane]}</span>
                      <span className="num text-xs text-ink-3">{ids.length}</span>
                    </div>
                    <div className="space-y-2">
                      {ids.map((id) => {
                        const t = TICKETS.find((x) => x.id === id)!;
                        const a = results.results[id]!.answers;
                        const d = decisions![id]!;
                        return <TicketCard key={id} ticket={t} answers={a} decision={d} selected={selected === id} onSelect={() => setSelected(selected === id ? null : id)} />;
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {selectedTicket && selectedAnswers && selectedDecision && (
            <section className="hairline rounded-md bg-panel p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-display text-lg">
                    {zh.a2.detail} · {selectedTicket.id} {selectedTicket.subject}
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{selectedTicket.message}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {selectedTicket.sender.display_name} &lt;{selectedTicket.sender.email}&gt; · plan {selectedTicket.customer.plan}
                    {selectedTicket.customer.open_orders.length ? ` · open orders ${selectedTicket.customer.open_orders.map((o) => o.id).join(", ")}` : ""}
                    {" · "}
                    {selectedTicket.note_zh}
                  </p>
                </div>
                <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setSelected(null)}>
                  {zh.a2.close}
                </button>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[16rem_1fr]">
                <div className="hairline rounded-md bg-paper p-3 text-xs">
                  <div className="font-medium">{zh.a2.reasons}</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-2">
                    {selectedDecision.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <div className="num mt-2 text-ink-3">
                    {zh.a2.spamRisk} {selectedDecision.spamRisk.toFixed(2)} · {zh.a2.priority} {selectedDecision.priority.toFixed(2)}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-ink-2">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                    显示被忽略的 speculative 答案
                  </label>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {A2_QUESTION_IDS.filter((id) => showAll || selectedDecision.usedQuestionIds.includes(id)).map((id) => {
                    const used = selectedDecision.usedQuestionIds.includes(id);
                    const a = selectedAnswers[id];
                    return a ? (
                      <div key={id} className={used ? "" : "opacity-50"}>
                        {!used && <div className="mb-1 text-[10px] text-ink-3">{zh.a2.unused}</div>}
                        <AnswerCard id={id} question={A2_QUESTIONS[id]} answer={a} />
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
              {selectedTrace && (
                <div className="mt-3">
                  <RequestInspector traces={[selectedTrace]} />
                </div>
              )}
            </section>
          )}

          {results && <SavingsCard scenario="a2" jevTraces={results.traces} />}
          {results && <RequestInspector traces={results.traces} />}
          <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
        </div>

        <aside className="hairline h-fit rounded-md bg-panel p-4 lg:sticky lg:top-4">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-sm">{zh.a2.sliders}</div>
            <button
              type="button"
              className="text-[11px] text-ink-3 hover:text-ink"
              onClick={() => {
                setThresholds(A2_THRESHOLDS);
                setWeights(A2_SPAM_WEIGHTS);
                setRecomputes((n) => n + 1);
              }}
            >
              {zh.a2.reset}
            </button>
          </div>
          <div className="num mt-1 text-[11px] text-ok">
            {zh.a2.recomputed} {recomputes} {zh.a2.times} · {zh.a2.noInference}
          </div>
          <div className="mt-3 space-y-3">
            {A2_SLIDERS.map((s) => (
              <ThresholdSlider key={s.key} label={s.label_zh} value={thresholds[s.key]} min={s.min} max={s.max} step={s.step} onChange={(v) => updateThreshold(s.key, v)} />
            ))}
            <div className="border-t border-rule pt-3 text-[11px] text-ink-3">
              垃圾风险 = Σ 权重 × Noul
            </div>
            {A2_WEIGHT_SLIDERS.map((s) => (
              <ThresholdSlider key={s.key} label={s.label_zh} value={weights[s.key]} min={0} max={1} step={0.05} onChange={(v) => updateWeight(s.key, v)} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
