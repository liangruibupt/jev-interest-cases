import { ASSIGNMENT, C1_THRESHOLDS, ESSAYS, MISCONCEPTION_ZH, STATUS_ZH, gradeFromAnswers, type Answers, type C1Thresholds, type CriterionStatus, type Grade, type JevTrace, type Trace } from "@jev/shared";
import { useMemo, useState } from "react";
import { LatencyChip } from "../components/LatencyChip";
import { LearningCard } from "../components/LearningCard";
import { ProbBars } from "../components/ProbBars";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { ScoreLine } from "../components/ScoreLine";
import { ThresholdSlider } from "../components/ThresholdSlider";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface GradeResponse {
  results: Record<string, { answers: Answers; traceId: string }>;
  traces: JevTrace[];
}
interface FeedbackResponse {
  feedback: string;
  grade: Grade;
  verification: { consistent: number; specific: number; kind: number };
  traces: Trace[];
  cached: boolean;
}

const STATUS_TONE: Record<CriterionStatus, string> = {
  met: "bg-ok/15 text-ok",
  missed: "bg-paper-2 text-ink-3",
  uncertain: "bg-warn/20 text-warn",
};
const LEVEL_LEGEND: Record<string, string> = Object.fromEntries(ASSIGNMENT.levels_zh.map((l, i) => [String(i), l]));

const LEARNING = {
  proves: [
    "评分是文字判断：每条细则一个 Noul、整体水平一个情境化 Score，一次请求 8 题；错误概念用 Choice 直接点名。",
    "内容与表达分开打分：E12 语法有误但科学完整，水平 3 而清晰度 1；这是 LLM 一个总分做不到的。",
    "置信度路由：灰区、低置信度、细则与整体不一致的作业交老师，其余自动出分。",
  ],
  tryThis: [
    "把\"达到\"门限从 0.7 拉到 0.9，看 E07（cause_scattering 0.48）以外还有谁被送去老师。",
    "选 E02（没写 Rayleigh）点\"生成反馈\"，看 Claude 是否只夸做到的、只提没做到的，再看 Jev 三个核验值。",
    "选 E03：术语拼成 Raleigh，Jev 按题目说明照样判为达到（0.99）——题目里怎么写，它就怎么判。",
  ],
  pitfalls: [
    "句子数由代码统计，Jev 不数数；数学题的对错也必须交给代码或 LLM 验算。",
    "错误概念清单是封闭的 Choice：清单外的错误只能落到 other_misconception。",
    "英文作答准确率最高；中文作文要先在小样本上校验置信度（A1 预置 7 显示 CJK 置信度下降）。",
  ],
};

function MiniBar({ value, status }: { value: number; status: CriterionStatus }) {
  return (
    <span className={`inline-flex min-w-16 items-center justify-between gap-2 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] ${STATUS_TONE[status]}`} title={`${STATUS_ZH[status]} · ${value.toFixed(3)}`}>
      <span>{STATUS_ZH[status]}</span>
      <span className="num">{value.toFixed(2)}</span>
    </span>
  );
}

export function C1Grading() {
  const { addTraces } = useSession();
  const [results, setResults] = useState<GradeResponse["results"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState<C1Thresholds>({ ...C1_THRESHOLDS });
  const [feedback, setFeedback] = useState<Record<string, FeedbackResponse>>({});
  const [fbBusy, setFbBusy] = useState(false);

  const grades = useMemo(() => {
    if (!results) return {};
    const out: Record<string, Grade> = {};
    for (const e of ESSAYS) {
      const r = results[e.id];
      if (r) out[e.id] = gradeFromAnswers(r.answers, e.text, t);
    }
    return out;
  }, [results, t]);

  const jevTraces = useMemo(() => history.filter((x): x is JevTrace => x.kind === "jev"), [history]);
  const teacherCount = Object.values(grades).filter((g) => g.needsTeacher).length;
  const gradedCount = Object.keys(grades).length;

  async function gradeAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<GradeResponse>("/api/c1/grade", { live });
      setResults(res.results);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
      if (!selected) setSelected(ESSAYS[0]!.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function makeFeedback(id: string) {
    setFbBusy(true);
    setError(null);
    try {
      const res = await api.post<FeedbackResponse>("/api/c1/feedback", { essayId: id });
      setFeedback((f) => ({ ...f, [id]: res }));
      if (res.traces.length) {
        setHistory((h) => [...h, ...res.traces]);
        addTraces(res.traces);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setFbBusy(false);
    }
  }

  const sel = selected ? ESSAYS.find((e) => e.id === selected) : undefined;
  const selGrade = selected ? grades[selected] : undefined;
  const selAnswers = selected ? results?.[selected]?.answers : undefined;
  const selFeedback = selected ? feedback[selected] : undefined;

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.c1.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.c1.intro}</p>
      </header>

      <section className="hairline mb-4 grid gap-4 rounded-md bg-panel p-4 lg:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.assignment} · {ASSIGNMENT.grade}</div>
          <p className="mt-1 text-sm text-ink">{ASSIGNMENT.prompt}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.rubric}</div>
          <ol className="mt-1 space-y-0.5 text-xs text-ink-2">
            {ASSIGNMENT.rubric.map((r, i) => (
              <li key={r.id}>
                <span className="num text-ink-3">{i + 1}.</span> {r.title_zh} <span className="num text-ink-3">· {r.id}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.levels}</div>
          <ol className="mt-1 space-y-0.5 text-xs text-ink-2">
            {ASSIGNMENT.levels_zh.map((l, i) => (
              <li key={l}>
                <span className="num text-ink-3">{i}</span> {l}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hairline mb-4 flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3">
        <button type="button" disabled={busy} onClick={() => void gradeAll()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
          {busy ? zh.c1.grading : zh.c1.gradeAll}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {zh.c1.live}
        </label>
        <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.thresholds}</span>
        <div className="flex flex-wrap gap-4">
          <ThresholdSlider label={zh.c1.yes} value={t.yes} min={0.5} max={0.95} step={0.05} onChange={(v) => setT({ ...t, yes: v })} />
          <ThresholdSlider label={zh.c1.no} value={t.no} min={0.05} max={0.5} step={0.05} onChange={(v) => setT({ ...t, no: v })} />
          <ThresholdSlider label={zh.c1.teacherConf} value={t.teacherConfidence} min={0.3} max={0.9} step={0.05} onChange={(v) => setT({ ...t, teacherConfidence: v })} />
        </div>
        {gradedCount > 0 && (
          <span className="ml-auto flex items-center gap-2 text-xs">
            <span className="rounded-sm bg-warn/20 px-1.5 py-0.5 text-warn">
              {zh.c1.needsTeacher} <span className="num">{teacherCount}</span>
            </span>
            <span className="rounded-sm bg-ok/15 px-1.5 py-0.5 text-ok">
              {zh.c1.autoGraded} <span className="num">{gradedCount - teacherCount}</span>
            </span>
          </span>
        )}
        {error && <div className="w-full rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!results && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.c1.empty}</div>}

      {results && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="hairline overflow-x-auto rounded-md bg-panel lg:col-span-3">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-ink-3">
                <tr className="border-b border-rule">
                  <th className="px-3 py-2 text-left">{zh.c1.student}</th>
                  {ASSIGNMENT.rubric.map((r, i) => (
                    <th key={r.id} className="px-2 py-2 text-left" title={r.title_zh}>
                      {i + 1}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left">{zh.c1.onTopic}</th>
                  <th className="px-2 py-2 text-left">{zh.c1.misconception}</th>
                  <th className="px-2 py-2 text-left">{zh.c1.level}</th>
                  <th className="px-2 py-2 text-left">{zh.c1.sentences}</th>
                  <th className="px-2 py-2 text-left">{zh.c1.teacher}</th>
                </tr>
              </thead>
              <tbody>
                {ESSAYS.map((e) => {
                  const g = grades[e.id];
                  if (!g) return null;
                  const isSel = selected === e.id;
                  return (
                    <tr key={e.id} onClick={() => setSelected(e.id)} className={`cursor-pointer border-b border-rule/60 ${isSel ? "bg-jev-soft/60" : "hover:bg-paper-2/60"}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className="num text-ink-3">{e.id}</span> <span className="text-ink">{e.student}</span>
                      </td>
                      {g.criteria.map((c) => (
                        <td key={c.id} className="px-2 py-1.5">
                          <MiniBar value={c.value} status={c.status} />
                        </td>
                      ))}
                      <td className={`num px-2 py-1.5 ${g.onTopic < t.onTopicMin ? "text-bad" : "text-ink-2"}`}>{g.onTopic.toFixed(2)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">{g.misconception && g.misconception.choice !== "none" ? <span className="rounded-sm bg-bad/10 px-1.5 py-0.5 text-bad">{MISCONCEPTION_ZH[g.misconception.choice]}</span> : "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="num text-ink">{g.level.toFixed(1)}</span>
                        <span className="ml-1 inline-block h-1.5 w-12 rounded-[3px] bg-paper-2 align-middle">
                          <span className="block h-1.5 rounded-[3px] bg-jev" style={{ width: `${(g.level / 3) * 100}%` }} />
                        </span>
                      </td>
                      <td className={`num px-2 py-1.5 ${g.flags.some((f) => f.startsWith("too_")) ? "text-warn" : "text-ink-2"}`}>{g.sentences}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{g.needsTeacher ? <span className="rounded-sm bg-warn/20 px-1.5 py-0.5 text-warn">{zh.c1.needsTeacher}</span> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="space-y-4 lg:col-span-2">
            {sel && selGrade && selAnswers ? (
              <>
                <section className="hairline rounded-md bg-panel p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-ink-3">
                      {zh.c1.answer} · {sel.id} {sel.student}
                    </div>
                    <span className="num text-xs text-ink-3">{selGrade.points}/{selGrade.maxPoints}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{sel.text}</p>
                  <p className="mt-2 text-[11px] text-ink-3">{sel.note_zh}</p>
                </section>

                <section className="hairline rounded-md bg-panel p-4 text-xs">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.criteria}</div>
                  <ul className="mt-2 space-y-1.5">
                    {selGrade.criteria.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className="w-44 shrink-0 text-ink-2">
                          {i + 1}. {ASSIGNMENT.rubric[i]!.title_zh}
                        </span>
                        <div className="relative h-1.5 flex-1 rounded-[3px] bg-paper-2">
                          <div className={`absolute inset-y-0 left-0 rounded-[3px] ${c.status === "met" ? "bg-ok" : c.status === "uncertain" ? "bg-warn" : "bg-rule"}`} style={{ width: `${c.value * 100}%` }} />
                          <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${t.no * 100}%` }} />
                          <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${t.yes * 100}%` }} />
                        </div>
                        <MiniBar value={c.value} status={c.status} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.levels}</div>
                  <div className="mt-1">
                    <ScoreLine score={selGrade.level} legend={LEVEL_LEGEND} probabilities={selGrade.levelProbabilities} />
                  </div>
                  {selGrade.misconception && (
                    <>
                      <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.misconception}</div>
                      <div className="mt-1">
                        <ProbBars probabilities={selGrade.misconception.probabilities} chosen={selGrade.misconception.choice} />
                      </div>
                    </>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-ink-3">{zh.c1.clarity}</span>
                    <span className="num text-ink">{selGrade.clarity?.toFixed(2) ?? "—"} / 2</span>
                    <span className="ml-3 text-ink-3">{zh.c1.sentences}</span>
                    <span className="num text-ink">{selGrade.sentences}</span>
                    {selGrade.flags.map((f) => (
                      <span key={f} className="rounded-sm bg-warn/20 px-1.5 py-0.5 text-warn">
                        {f.startsWith("misconception:") ? MISCONCEPTION_ZH[f.slice("misconception:".length) as keyof typeof MISCONCEPTION_ZH] : zh.c1.flagLabels[f as keyof typeof zh.c1.flagLabels] ?? f}
                      </span>
                    ))}
                  </div>
                  {selGrade.reasons.length > 0 && (
                    <div className="mt-3 rounded-sm bg-warn/10 p-2 text-warn">
                      <div className="text-[11px] uppercase tracking-wider">{zh.c1.reasons}</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {selGrade.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="hairline rounded-md bg-panel p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c1.feedbackTitle}</div>
                    <button type="button" disabled={fbBusy} onClick={() => void makeFeedback(sel.id)} className="rounded-md bg-claude px-3 py-1.5 text-xs text-white disabled:opacity-40">
                      {fbBusy ? zh.c1.feedbackWorking : zh.c1.feedback}
                    </button>
                  </div>
                  {selFeedback && (
                    <div className="mt-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{selFeedback.feedback}</p>
                      {selFeedback.cached && <p className="mt-1 text-[11px] text-ink-3">{zh.c1.cachedFeedback}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["consistent", "specific", "kind"] as const).map((k) => {
                          const v = selFeedback.verification[k];
                          return (
                            <span key={k} className={`rounded-sm px-1.5 py-0.5 ${v >= 0.7 ? "bg-ok/15 text-ok" : v <= 0.3 ? "bg-bad/10 text-bad" : "bg-warn/20 text-warn"}`}>
                              {zh.c1.verify[k]} <span className="num">{v.toFixed(2)}</span>
                            </span>
                          );
                        })}
                        {selFeedback.traces.filter((x) => x.kind === "claude").map((x) => (
                          <span key={x.id} className="flex items-center gap-1 text-ink-3">
                            <LatencyChip ms={x.latencyMs} kind="claude" /> <span className="num">{fmtUsd(x.cost.usd)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="hairline rounded-md bg-panel p-6 text-center text-xs text-ink-3">{zh.c1.pick}</section>
            )}
            <SavingsCard scenario="c1" jevTraces={jevTraces} />
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
