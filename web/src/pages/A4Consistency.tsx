import {
  A4_ARMS,
  A4_CASES,
  A4_LIMITS,
  armLabel,
  computeArmMetrics,
  estimateRunCost,
  ratiosVsJev,
  type A4CaseId,
  type ArmId,
  type JevTrace,
  type RunRecord,
} from "@jev/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarList } from "../components/BarList";
import { Heatmap, Legend } from "../components/Heatmap";
import { LearningCard } from "../components/LearningCard";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { fmtMs, fmtRatio, fmtUsd } from "../lib/format";
import { labelColorMap } from "../lib/palette";
import { openSse } from "../lib/sse";
import { useSession } from "../store/session";

const LEARNING = {
  proves: [
    "校准 ≠ 稳定：Jev 的概率是训练目标（RLCD），LLM 的概率是\"说出来的\"；t=0 让 LLM 方差极低，但那只是每次说同样的话。",
    "同一批问题下 Jev 与 Claude 的延迟和单次费用相差 1–2 个数量级——这是你在自己网络上量到的数字，不是官网的。",
    "为什么只比概率不比 confidence：Jev 的 confidence 公式未公开，适配器不伪造它；概率分布才是两边都有的东西。",
  ],
  tryThis: [
    "只选 Jev 跑 15 轮，看哪几题会翻转、翻转时最高概率是不是接近 0.5。",
    "把\"不确定门限\"从 0.6 换成 0.8（代码常量 A4_LIMITS.uncertainBelow），看策略一致率如何变化。",
    "开 nonce 再跑一次，比较是否有可见差异。",
    "换成工单案例，看 Score 与 Noul 在热力图里的表现。",
  ],
  pitfalls: [
    "单个案例不代表整体；官方数字来自不同的样本与时间。",
    "LLM 结构化输出的概率可能不合法（和不为 1、全 0），页面显示了归一化幅度与退化次数。",
    "本地网络往返约 0.3s 计入了所有臂的延迟，Jev 的相对优势因此被压低。",
  ],
};

type Phase = "idle" | "running" | "done";

export function A4Consistency() {
  const { addTraces } = useSession();
  const [caseId, setCaseId] = useState<A4CaseId>("moderation");
  const [runs, setRuns] = useState(10);
  const [arms, setArms] = useState<ArmId[]>(A4_ARMS.filter((a) => a.enabledByDefault).map((a) => a.id));
  const [nonce, setNonce] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  const a4case = A4_CASES.find((c) => c.id === caseId)!;
  const estimate = useMemo(() => estimateRunCost(caseId, arms, runs), [caseId, arms, runs]);
  const questionTypes = useMemo(() => Object.fromEntries(Object.entries(a4case.questions).map(([id, q]) => [id, q.type])), [a4case]);

  useEffect(() => () => closeRef.current?.(), []);

  function start() {
    closeRef.current?.();
    setRecords([]);
    setErrors([]);
    setSavedTo(null);
    setPhase("running");
    const url = `/api/a4/run?caseId=${caseId}&runs=${runs}&arms=${arms.join(",")}${nonce ? "&nonce=1" : ""}`;
    closeRef.current = openSse(url, ["start", "run", "arm_error", "done"], {
      onEvent: (event, data) => {
        if (event === "run") {
          const r = data as RunRecord;
          setRecords((prev) => [...prev, r]);
          // Feed the session cost meter with a lightweight trace-like record.
          const arm = A4_ARMS.find((a) => a.id === r.arm)!;
          if (arm.kind === "jev") {
            const trace: JevTrace = {
              kind: "jev", id: r.traceId, scenario: "a4", startedAt: "", latencyMs: r.latencyMs, cached: false, model: "jev-latest",
              request: { state: null, questions: {}, model: "jev-latest" },
              response: { answers: r.answers, usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens } }, cost: { usd: r.costUsd },
            };
            addTraces([trace]);
          } else {
            addTraces([{ kind: "claude", id: r.traceId, scenario: "a4", purpose: "llmSystemOne", startedAt: "", latencyMs: r.latencyMs, tier: arm.tier!, model: armLabel(r.arm), inputTokens: r.inputTokens, outputTokens: r.outputTokens, cost: { usd: r.costUsd }, stopReason: null }]);
          }
        } else if (event === "arm_error") {
          const e = data as { arm: string; run: number; message: string };
          setErrors((prev) => [...prev, `${armLabel(e.arm as ArmId)} 第 ${e.run} 轮：${e.message}`]);
        } else if (event === "done") {
          setSavedTo((data as { savedTo: string | null }).savedTo);
          setPhase("done");
          closeRef.current?.();
        }
      },
      onError: () => {
        setErrors((prev) => [...prev, "SSE 连接中断"]);
        setPhase("done");
        closeRef.current?.();
      },
    });
  }

  function stop() {
    closeRef.current?.();
    setPhase("done");
  }

  const metrics = useMemo(() => arms.map((arm) => computeArmMetrics(arm, records, a4case.questions)).filter((m) => m.runs > 0), [arms, records, a4case]);
  const ratios = useMemo(() => ratiosVsJev(metrics), [metrics]);
  const colorsByQuestion = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const qid of Object.keys(a4case.questions)) {
      const labels = metrics.flatMap((m) => m.questions.find((q) => q.questionId === qid)?.labelsPerRun ?? []);
      out[qid] = labelColorMap(labels);
    }
    return out;
  }, [metrics, a4case]);
  const allColors = useMemo(() => Object.assign({}, ...Object.values(colorsByQuestion)) as Record<string, string>, [colorsByQuestion]);
  const jevTraces = useMemo<JevTrace[]>(
    () =>
      records
        .filter((r) => r.arm === "jev")
        .map((r) => ({
          kind: "jev", id: r.traceId, scenario: "a4", startedAt: "", latencyMs: r.latencyMs, cached: false, model: "jev-latest",
          request: { state: null, questions: {}, model: "jev-latest" },
          response: { answers: r.answers, usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens } }, cost: { usd: r.costUsd },
        })),
    [records],
  );

  const jevM = metrics.find((m) => m.arm === "jev");
  const conclusion = useMemo(() => {
    if (!jevM) return null;
    const others = metrics.filter((m) => m.arm !== "jev");
    if (!others.length) return `Jev p50 ${fmtMs(jevM.p50LatencyMs)}，单次 ${fmtUsd(jevM.usdPerCall)}，原始一致率 ${(jevM.meanRawAgreement * 100).toFixed(0)}%，策略一致率 ${(jevM.meanPolicyAgreement * 100).toFixed(0)}%。`;
    return others
      .map((m) => {
        const r = ratios[m.arm];
        return `${armLabel(m.arm)} p50 ${fmtMs(m.p50LatencyMs)} / ${fmtUsd(m.usdPerCall)} → Jev 快 ${fmtRatio(r?.latency ?? null)}、便宜 ${fmtRatio(r?.cost ?? null)}；策略一致率 ${(jevM.meanPolicyAgreement * 100).toFixed(0)}% vs ${(m.meanPolicyAgreement * 100).toFixed(0)}%`;
      })
      .join("；");
  }, [metrics, jevM, ratios]);

  const progress = arms.map((arm) => ({ arm, n: records.filter((r) => r.arm === arm).length }));
  const llmDiag = (arm: ArmId) => {
    const recs = records.filter((r) => r.arm === arm && r.normalizationDelta);
    if (!recs.length) return null;
    const deltas = recs.flatMap((r) => Object.values(r.normalizationDelta ?? {}));
    const degenerate = recs.reduce((s, r) => s + (r.degenerate?.length ?? 0), 0);
    return { delta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0, degenerate };
  };

  return (
    <div className="rise mx-auto max-w-7xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl">{zh.a4.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.a4.intro}</p>
      </header>

      <section className="hairline mb-4 grid gap-4 rounded-md bg-panel p-4 lg:grid-cols-[1fr_1fr_auto]">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.a4.caseLabel}</div>
          <div className="mt-1 space-y-1">
            {A4_CASES.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="case" checked={caseId === c.id} disabled={phase === "running"} onChange={() => setCaseId(c.id)} className="mt-1" />
                <span>
                  <span className="font-medium">{c.title_zh}</span>
                  <span className="block text-xs text-ink-3">{c.description_zh}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm">
            <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wider text-ink-3">
              <span>{zh.a4.runs}</span>
              <span className="num normal-case tracking-normal text-ink">{runs}</span>
            </div>
            <input type="range" min={A4_LIMITS.minRuns} max={A4_LIMITS.maxRuns} step={1} value={runs} disabled={phase === "running"} onChange={(e) => setRuns(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-jev)]" />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-2" title={zh.a4.nonceHint}>
            <input type="checkbox" checked={nonce} disabled={phase === "running"} onChange={(e) => setNonce(e.target.checked)} />
            {zh.a4.nonce}
          </label>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.a4.arms}</div>
          <div className="mt-1 space-y-1">
            {A4_ARMS.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={arms.includes(a.id)}
                  disabled={phase === "running"}
                  onChange={(e) => setArms((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)))}
                />
                <span>
                  <span className={a.kind === "jev" ? "text-jev" : "text-claude"}>{a.label}</span>
                  {!a.enabledByDefault && <span className="ml-1 text-[10px] text-ink-3">{zh.a4.optional}</span>}
                  <span className="block text-xs text-ink-3">{a.note_zh}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-3">
          <div className="text-right">
            <div className="text-[11px] text-ink-3">{zh.a4.estimate}</div>
            <div className="num text-lg">{fmtUsd(estimate.usd)}</div>
            <div className="num text-[10px] text-ink-3">
              {arms.length} 臂 × {runs} 轮
            </div>
          </div>
          {phase === "running" ? (
            <button type="button" onClick={stop} className="hairline rounded-md bg-paper px-4 py-2 text-sm">
              {zh.a4.stop}
            </button>
          ) : (
            <button type="button" onClick={start} disabled={arms.length === 0} className="rounded-md bg-jev px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {zh.a4.start}
            </button>
          )}
        </div>
      </section>

      {phase !== "idle" && (
        <div className="num mb-4 flex flex-wrap gap-3 text-xs text-ink-2">
          <span>{phase === "running" ? zh.a4.running : "完成"}</span>
          {progress.map((p) => (
            <span key={p.arm}>
              {armLabel(p.arm)} {p.n}/{runs}
            </span>
          ))}
          {savedTo && (
            <span className="text-ink-3">
              {zh.a4.saved} {savedTo}
            </span>
          )}
        </div>
      )}
      {errors.length > 0 && <ul className="mb-4 rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}

      {phase === "idle" && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.a4.empty}</div>}

      {metrics.length > 0 && (
        <>
          <p className="mb-2 text-xs text-ink-3">{zh.a4.heatmapHint}</p>
          <div className="mb-3">
            <Legend colors={allColors} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {metrics.map((m) => {
              const diag = llmDiag(m.arm);
              return (
                <section key={m.arm} className="hairline rounded-md bg-panel p-4">
                  <div className="flex items-baseline justify-between">
                    <span className={`font-display ${m.arm === "jev" ? "text-jev" : "text-claude"}`}>{armLabel(m.arm)}</span>
                    <span className="num text-xs text-ink-3">
                      {m.runs}/{runs} 轮
                    </span>
                  </div>
                  <div className="mt-2">
                    <Heatmap
                      questions={m.questions}
                      runs={runs}
                      colors={Object.assign({}, ...Object.values(colorsByQuestion)) as Record<string, string>}
                      uncertainBelow={A4_LIMITS.uncertainBelow}
                      typeById={questionTypes}
                    />
                  </div>
                  <dl className="num mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-ink-2">
                    <dt className="text-ink-3">{zh.a4.raw}</dt>
                    <dd className="col-span-2">{(m.meanRawAgreement * 100).toFixed(1)}%</dd>
                    <dt className="text-ink-3">{zh.a4.policy}</dt>
                    <dd className="col-span-2">
                      {(m.meanPolicyAgreement * 100).toFixed(1)}%（{zh.a4.uncertain} {(m.meanUncertainShare * 100).toFixed(1)}%）
                    </dd>
                    <dt className="text-ink-3">{zh.a4.meanStd}</dt>
                    <dd className="col-span-2">{m.meanStd.toFixed(4)}</dd>
                    <dt className="text-ink-3">{zh.a4.p50}</dt>
                    <dd className="col-span-2">
                      {fmtMs(m.p50LatencyMs)}（均值 {fmtMs(m.meanLatencyMs)}）
                    </dd>
                    <dt className="text-ink-3">{zh.a4.perCall}</dt>
                    <dd className="col-span-2">
                      {fmtUsd(m.usdPerCall)}（合计 {fmtUsd(m.totalUsd)}）
                    </dd>
                    {diag && (
                      <>
                        <dt className="text-ink-3">{zh.a4.normalization}</dt>
                        <dd className="col-span-2">
                          {diag.delta.toFixed(3)} · {zh.a4.degenerate} {diag.degenerate}
                        </dd>
                      </>
                    )}
                  </dl>
                </section>
              );
            })}
          </div>

          <section className="hairline mt-4 grid gap-4 rounded-md bg-panel p-4 lg:grid-cols-3">
            <BarList title={zh.a4.p50} log data={metrics.map((m) => ({ label: armLabel(m.arm), value: m.p50LatencyMs, display: fmtMs(m.p50LatencyMs), tone: m.arm === "jev" ? "jev" : "claude" }))} />
            <BarList title={zh.a4.perCall} log data={metrics.map((m) => ({ label: armLabel(m.arm), value: m.usdPerCall, display: fmtUsd(m.usdPerCall), tone: m.arm === "jev" ? "jev" : "claude" }))} />
            <BarList title={zh.a4.meanStd} data={metrics.map((m) => ({ label: armLabel(m.arm), value: m.meanStd, display: m.meanStd.toFixed(4), tone: m.arm === "jev" ? "jev" : "claude" }))} />
          </section>

          <section className="hairline mt-4 overflow-x-auto rounded-md bg-panel p-4">
            <div className="font-display text-sm">{zh.a4.summary}</div>
            <table className="num mt-2 w-full text-left text-xs">
              <thead className="text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">{zh.a4.arm}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.p50}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.perCall}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.vsJev}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.meanStd}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.raw}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.policy}</th>
                  <th className="py-1 pr-3 font-normal">{zh.a4.uncertain}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.arm} className="border-t border-rule">
                    <td className={`py-1 pr-3 ${m.arm === "jev" ? "text-jev" : "text-claude"}`}>{armLabel(m.arm)}</td>
                    <td className="py-1 pr-3">{fmtMs(m.p50LatencyMs)}</td>
                    <td className="py-1 pr-3">{fmtUsd(m.usdPerCall)}</td>
                    <td className="py-1 pr-3">
                      {fmtRatio(ratios[m.arm]?.latency ?? null)} 慢 · {fmtRatio(ratios[m.arm]?.cost ?? null)} 贵
                    </td>
                    <td className="py-1 pr-3">{m.meanStd.toFixed(4)}</td>
                    <td className="py-1 pr-3">{(m.meanRawAgreement * 100).toFixed(1)}%</td>
                    <td className="py-1 pr-3">{(m.meanPolicyAgreement * 100).toFixed(1)}%</td>
                    <td className="py-1 pr-3">{(m.meanUncertainShare * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conclusion && (
              <p className="mt-3 text-sm text-ink-2">
                <span className="font-medium text-ink">{zh.a4.conclusion}：</span>
                {conclusion}
              </p>
            )}
          </section>

          <div className="mt-4 space-y-4">
            <SavingsCard scenario="a4" jevTraces={jevTraces} />
          </div>
        </>
      )}
      <div className="mt-4">
        <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
      </div>
    </div>
  );
}
