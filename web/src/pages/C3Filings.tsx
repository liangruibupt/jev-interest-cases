import { C3_NOT_ASKED, C3_THRESHOLDS, DIRECTION_LABELS_ZH, EVENT_LABELS_ZH, FILINGS, FLAG_LABELS_ZH, READING_LANE_LABELS_ZH, judgeFiling, type Answers, type C3Thresholds, type FilingJudgment, type JevTrace, type ReadingLane, type Trace } from "@jev/shared";
import { useMemo, useState } from "react";
import { ConfidenceRing } from "../components/ConfidenceRing";
import { LearningCard } from "../components/LearningCard";
import { ProbBars } from "../components/ProbBars";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { ScoreLine } from "../components/ScoreLine";
import { ThresholdSlider } from "../components/ThresholdSlider";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { useSession } from "../store/session";

interface JudgeResponse {
  results: Record<string, { answers: Answers; traceId: string }>;
  errors: Record<string, string>;
  traces: JevTrace[];
}

const LANES: ReadingLane[] = ["read_now", "today", "archive"];
const LANE_TONE: Record<ReadingLane, string> = { read_now: "bg-bad/10 text-bad border-bad/30", today: "bg-warn/15 text-warn border-warn/30", archive: "bg-paper-2 text-ink-3 border-rule" };
const DIRECTION_TONE: Record<string, string> = { negative: "bg-bad/10 text-bad", positive: "bg-ok/10 text-ok", mixed: "bg-warn/15 text-warn", neutral: "bg-paper-2 text-ink-3" };
const MATERIALITY_LEGEND: Record<string, string> = { "0": "常规事务，不影响经营", "1": "值得注意但在预期内或规模小", "2": "对业绩、经营、领导层或重大产品 / 客户有显著影响", "3": "可能改变估值或持续经营" };

const LEARNING = {
  proves: [
    "公告的重大性、事件类型、方向、措辞是否含糊，都是对文字的判断：一次请求 8 题，每条约 1,200 tokens、$0.00005。",
    "校准过的概率比 LLM 的口头\"可能重大\"更好用：materiality 是 0–3 的连续值，可以排序、可以设门限、可以随风险调整。",
    "边界清楚：没有问买卖、估值或涨跌；金额只由代码提取用于展示。",
  ],
  tryThis: [
    "把\"立即看\"门限从 1.8 拉到 2.3（设计稿的值），看 F01 / F08 / F09 / F14 掉到今日看——再想想四级描述里\"显著影响\"到底该进哪个泳道。",
    "看 F12（更换审计师）：\"except as described\"、\"certain matters\" 让 hedged_language 升高，会计规则把它直接送到立即看。",
    "对比 F05（回购授权）和 F07（分红不变）：同是 capital_return，重大性差别由 Score 的情境描述体现。",
  ],
  pitfalls: [
    "这不是投资建议：Jev 判断的是公告说了什么、说得多重大，不是股价会怎样。",
    "虚构公司与合成文本；真实公告更长、更套话，先在样本上校验 boilerplate 与 materiality 的分布。",
    "事件类型是封闭清单：清单外只能落到 other；门限附近会漂移，立即看 / 今日看之间的公告值得都看一眼。",
  ],
};

function MiniNoul({ label, value, flagAt }: { label: string; value: number; flagAt: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]" title={`${label} = ${value.toFixed(3)}`}>
      <span className="w-20 shrink-0 text-ink-3">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-[3px] bg-paper-2">
        <div className={`absolute inset-y-0 left-0 rounded-[3px] ${value >= flagAt ? "bg-warn" : "bg-jev"}`} style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${flagAt * 100}%` }} />
      </div>
      <span className={`num w-8 text-right ${value >= flagAt ? "text-warn" : "text-ink"}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export function C3Filings() {
  const { addTraces } = useSession();
  const [results, setResults] = useState<JudgeResponse["results"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState<C3Thresholds>({ ...C3_THRESHOLDS });

  const judgments = useMemo(() => {
    if (!results) return {};
    const out: Record<string, FilingJudgment> = {};
    for (const f of FILINGS) {
      const r = results[f.id];
      if (r) out[f.id] = judgeFiling(r.answers, f.text, t);
    }
    return out;
  }, [results, t]);
  const jevTraces = useMemo(() => history.filter((x): x is JevTrace => x.kind === "jev"), [history]);

  async function judgeAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<JudgeResponse>("/api/c3/judge", { live });
      setResults(res.results);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
      if (Object.keys(res.errors).length) setError(Object.entries(res.errors).map(([id, e]) => `${id}: ${e}`).join("；"));
      if (!selected) setSelected("F01");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const sel = selected ? FILINGS.find((f) => f.id === selected) : undefined;
  const selJ = selected ? judgments[selected] : undefined;

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.c3.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.c3.intro}</p>
      </header>

      <section className="hairline mb-4 flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3">
        <button type="button" disabled={busy} onClick={() => void judgeAll()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
          {busy ? zh.c3.judging : zh.c3.judgeAll}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {zh.c3.live}
        </label>
        <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.thresholds}</span>
        <div className="flex flex-wrap gap-4">
          <ThresholdSlider label={zh.c3.readNow} value={t.readNow} min={1.5} max={3} step={0.1} onChange={(v) => setT((p) => ({ ...p, readNow: v }))} />
          <ThresholdSlider label={zh.c3.today} value={t.today} min={0.5} max={2} step={0.1} onChange={(v) => setT((p) => ({ ...p, today: v }))} />
          <ThresholdSlider label={zh.c3.flag} value={t.flag} min={0.5} max={0.95} step={0.05} onChange={(v) => setT((p) => ({ ...p, flag: v }))} />
        </div>
        {error && <div className="w-full rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!results && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.c3.empty}</div>}

      {results && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="space-y-3 lg:col-span-3">
            {LANES.map((lane) => {
              const items = FILINGS.filter((f) => judgments[f.id]?.lane === lane).sort((a, b) => (judgments[b.id]?.materiality ?? 0) - (judgments[a.id]?.materiality ?? 0));
              return (
                <div key={lane} className="hairline rounded-md bg-panel">
                  <div className={`flex items-center justify-between rounded-t-md border-b px-4 py-2 text-xs ${LANE_TONE[lane]}`}>
                    <span className="font-medium">{READING_LANE_LABELS_ZH[lane]}</span>
                    <span className="num">{items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-ink-3">—</div>
                  ) : (
                    <ul className="divide-y divide-rule/60">
                      {items.map((f) => {
                        const j = judgments[f.id]!;
                        const isSel = selected === f.id;
                        return (
                          <li key={f.id}>
                            <button type="button" onClick={() => setSelected(f.id)} className={`w-full px-4 py-2 text-left text-xs ${isSel ? "bg-jev-soft/60" : "hover:bg-paper-2/60"}`}>
                              <div className="flex items-center gap-2">
                                <span className="num text-ink-3">{f.id}</span>
                                <span className="text-ink">{f.company}</span>
                                <span className="rounded-sm bg-paper-2 px-1 text-[10px] text-ink-3">{zh.c3.source[f.source]}</span>
                                {j.event && <span className="rounded-sm bg-jev-soft px-1 text-[10px] text-jev">{EVENT_LABELS_ZH[j.event.choice]}</span>}
                                {j.direction && <span className={`rounded-sm px-1 text-[10px] ${DIRECTION_TONE[j.direction.choice] ?? DIRECTION_TONE.neutral}`}>{DIRECTION_LABELS_ZH[j.direction.choice] ?? j.direction.choice}</span>}
                                <span className="ml-auto flex items-center gap-2">
                                  <span className="inline-block h-1.5 w-16 rounded-[3px] bg-paper-2 align-middle">
                                    <span className="block h-1.5 rounded-[3px] bg-jev" style={{ width: `${(j.materiality / 3) * 100}%` }} />
                                  </span>
                                  <span className="num w-8 text-ink">{j.materiality.toFixed(1)}</span>
                                </span>
                              </div>
                              <p className="mt-1 text-ink">{f.headline}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {j.flags.map((fl) => (
                                  <span key={fl} className="rounded-sm bg-warn/15 px-1 text-[10px] text-warn">
                                    {FLAG_LABELS_ZH[fl] ?? fl}
                                  </span>
                                ))}
                                {j.amounts.map((a, i) => (
                                  <span key={`${a.text}-${i}`} className="num rounded-sm bg-paper-2 px-1 text-[10px] text-ink-3">
                                    {a.text}
                                  </span>
                                ))}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          <div className="space-y-4 lg:col-span-2">
            {sel && selJ ? (
              <section className="hairline rounded-md bg-panel p-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3">
                    {zh.c3.filing} · {sel.id} · {sel.company}
                  </div>
                  <span className={`rounded-sm border px-1.5 py-0.5 ${LANE_TONE[selJ.lane]}`}>{READING_LANE_LABELS_ZH[selJ.lane]}</span>
                </div>
                <p className="mt-2 font-medium text-ink">{sel.headline}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{sel.text}</p>
                <p className="mt-1 text-[11px] text-ink-3">
                  {zh.c3.expected}：{sel.expected.lanes.map((l) => READING_LANE_LABELS_ZH[l]).join(" / ")} · {sel.note_zh}
                </p>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.rule}</div>
                <p className="mt-1 text-ink">{selJ.rule_zh}</p>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.materiality}</div>
                <div className="mt-1 flex items-start gap-3">
                  <div className="flex-1"><ScoreLine score={selJ.materiality} legend={MATERIALITY_LEGEND} probabilities={selJ.materialityProbabilities} /></div>
                  <ConfidenceRing value={selJ.materialityConfidence} />
                </div>

                {selJ.event && (
                  <>
                    <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.event}</div>
                    <div className="mt-1 flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={Object.fromEntries(Object.entries(selJ.event.probabilities).filter(([, p]) => p >= 0.01))} chosen={selJ.event.choice} /></div>
                      <ConfidenceRing value={selJ.event.confidence} />
                    </div>
                  </>
                )}
                {selJ.direction && (
                  <>
                    <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.direction}</div>
                    <div className="mt-1"><ProbBars probabilities={selJ.direction.probabilities} chosen={selJ.direction.choice} /></div>
                  </>
                )}

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.signals}</div>
                <div className="mt-1 space-y-1">
                  <MiniNoul label={zh.c3.signalLabels.accounting} value={selJ.signals.accounting} flagAt={t.flag} />
                  <MiniNoul label={zh.c3.signalLabels.keyPerson} value={selJ.signals.keyPerson} flagAt={t.flag} />
                  <MiniNoul label={zh.c3.signalLabels.hedged} value={selJ.signals.hedged} flagAt={t.hedged} />
                  <MiniNoul label={zh.c3.signalLabels.forwardLooking} value={selJ.signals.forwardLooking} flagAt={t.flag} />
                  <MiniNoul label={zh.c3.signalLabels.boilerplate} value={selJ.signals.boilerplate} flagAt={t.boilerplate} />
                </div>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c3.amounts}</div>
                <div className="num mt-1 flex flex-wrap gap-1.5 text-ink-2">
                  {selJ.amounts.length === 0 ? zh.c3.noAmounts : selJ.amounts.map((a, i) => <span key={`${a.text}-${i}`} className="rounded-sm bg-paper-2 px-1.5 py-0.5">{a.text}</span>)}
                </div>
              </section>
            ) : (
              <section className="hairline rounded-md bg-panel p-6 text-center text-xs text-ink-3">{zh.c3.pick}</section>
            )}

            <section className="hairline rounded-md bg-panel p-4 text-xs">
              <div className="text-[11px] uppercase tracking-wider text-bad">{zh.c3.notAsked}</div>
              <ul className="mt-1 space-y-1.5">
                {C3_NOT_ASKED.map((q) => (
                  <li key={q.question} className="rounded-sm border border-dashed border-bad/30 p-2">
                    <div className="font-mono text-ink line-through decoration-bad/60">{q.question}</div>
                    <div className="mt-0.5 text-ink-2">{q.why_zh}</div>
                  </li>
                ))}
              </ul>
            </section>

            <SavingsCard scenario="c3" jevTraces={jevTraces} />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <RequestInspector traces={history} />
        <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
      </div>
    </div>
  );
}
