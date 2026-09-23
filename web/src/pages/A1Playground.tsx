import { A1_PRESETS, summarizeNouls, validateQuestions, type Answers, type EntryType, type JevTrace, type Questions } from "@jev/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerCard } from "../components/AnswerCard";
import { LatencyChip } from "../components/LatencyChip";
import { LearningCard } from "../components/LearningCard";
import { QuestionEditor } from "../components/QuestionEditor";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface A1Response {
  answers: Answers;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  traces: JevTrace[];
}

const LEARNING = {
  proves: [
    "三种原语返回的是概率分布，不是文字：Choice 给全分布，Score 给期望值与逐级概率，Noul 给一个概率。",
    "同一 state 的多个问题一次请求、并行评估；再多问几题几乎不增加延迟。",
    "问题 ID 不发给模型，instructions 必须自成一体。",
  ],
  tryThis: [
    "把预置 1 的 state 改成 \"Thanks, that fixed it!\"，看 is_urgent 掉到 0.0x。",
    "把预置 5 的三条情境描述改成 \"Low / Medium / High\"，看置信度如何下降。",
    "开实时模式，逐字修改 state，感受 0.5–0.8 秒的响应节奏（本地网络含约 0.3 秒往返）。",
    "粘贴一段你自己的客服消息，用预置 1 的三题评估。",
  ],
  pitfalls: [
    "Noul 0.5 表示\"是否各半\"，不是\"中等程度\"。",
    "反向问法（Is it free of…）与正向问法的答案不保证相加为 1。",
    "让 Jev 数数、算数、比较日期都不可靠，这些留给代码。",
    "中文输入可用但概率更分散（预置 7）。",
  ],
};

function parseState(text: string): { value: EntryType; isJson: boolean } {
  const t = text.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return { value: JSON.parse(t) as EntryType, isJson: true };
    } catch {
      /* fall through: send as string */
    }
  }
  return { value: text, isJson: false };
}

export function A1Playground() {
  const { addTraces } = useSession();
  const [presetId, setPresetId] = useState(A1_PRESETS[0]!.id);
  /** Bumped on every preset selection so re-clicking the same preset also resets the editor rows. */
  const [editorVersion, setEditorVersion] = useState(0);
  const preset = useMemo(() => A1_PRESETS.find((p) => p.id === presetId) ?? A1_PRESETS[0]!, [presetId]);
  const [stateText, setStateText] = useState(() => (typeof preset.state === "string" ? preset.state : JSON.stringify(preset.state, null, 2)));
  const [questions, setQuestions] = useState<Questions | null>(preset.questions);
  const [editorErrors, setEditorErrors] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [traces, setTraces] = useState<JevTrace[]>([]);
  const [last, setLast] = useState<A1Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const liveTimer = useRef<number | null>(null);
  /** Monotonic request counter so a slow earlier request cannot overwrite a newer answer. */
  const seq = useRef(0);

  const parsedState = useMemo(() => parseState(stateText), [stateText]);
  const validation = useMemo(() => (questions ? validateQuestions(questions) : []), [questions]);
  const canRun = questions !== null && editorErrors.length === 0 && validation.length === 0 && !busy;

  function selectPreset(id: string) {
    const p = A1_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setEditorVersion((v) => v + 1);
    setStateText(typeof p.state === "string" ? p.state : JSON.stringify(p.state, null, 2));
    setQuestions(p.questions);
    setEditorErrors([]);
    setAnswers(null);
    setLast(null);
    setError(null);
  }

  const run = useCallback(
    async (opts: { live: boolean }) => {
      if (!questions) return;
      const mine = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const res = await api.post<A1Response>("/api/a1/evaluate", { state: parsedState.value, questions, live: opts.live });
        if (mine !== seq.current) return; // a newer request is in flight; discard this stale answer
        setAnswers(res.answers);
        setLast(res);
        setTraces((t) => [...t, ...res.traces]);
        addTraces(res.traces);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e instanceof ApiError ? `${e.message}${e.detail ? `：${JSON.stringify(e.detail)}` : ""}` : String(e));
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [questions, parsedState, addTraces],
  );

  useEffect(() => {
    if (!live || !canRun) return;
    if (liveTimer.current) window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => void run({ live: true }), 400);
    return () => {
      if (liveTimer.current) window.clearTimeout(liveTimer.current);
    };
    // Only re-run on state edits (the common live interaction), not on every questions edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateText, live]);

  const orderedIds = questions ? Object.keys(questions) : [];
  const lastTrace = last?.traces[0];
  const summary = preset.summarize && answers ? summarizeNouls(answers, preset.summarize) : null;

  return (
    <div className="rise mx-auto max-w-7xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl">{zh.a1.title}</h1>
        <p className="mt-1 text-sm text-ink-2">{zh.a1.intro}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <section>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.a1.presets}</div>
            <div className="flex flex-wrap gap-1.5">
              {A1_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={`hairline rounded-sm px-2 py-1 text-xs ${p.id === presetId ? "border-jev bg-jev-soft text-jev" : "bg-panel text-ink-2 hover:bg-paper-2"}`}
                >
                  {p.title_zh}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-2">{preset.lesson_zh}</p>
            <p className="mt-1 text-xs text-ink-3">
              {zh.a1.expect}：{preset.expect_zh}
            </p>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-ink-3">
              <span>{zh.a1.state}</span>
              <span className="num normal-case tracking-normal">{parsedState.isJson ? zh.a1.stateJson : zh.a1.stateString}</span>
            </div>
            <textarea
              className="hairline w-full rounded-md bg-panel p-3 font-mono text-xs leading-snug"
              rows={Math.min(16, Math.max(4, stateText.split("\n").length + 1))}
              value={stateText}
              onChange={(e) => setStateText(e.target.value)}
            />
          </section>

          <section>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.a1.questions}</div>
            <QuestionEditor
              key={`${presetId}-${editorVersion}`}
              initial={preset.questions}
              onChange={(q, errs) => {
                setQuestions(q);
                setEditorErrors(errs);
              }}
            />
            {validation.length > 0 && <ul className="mt-2 text-[11px] text-bad">{validation.map((v) => <li key={`${v.questionId}-${v.message}`}>{v.questionId ? `${v.questionId}: ` : ""}{v.message}</li>)}</ul>}
          </section>

          <section className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canRun}
              onClick={() => void run({ live: false })}
              className="rounded-md bg-jev px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? zh.a1.running : zh.a1.run}
            </button>
            <label className="flex items-center gap-2 text-xs text-ink-2" title={zh.a1.liveHint}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              {zh.a1.live}
            </label>
            <button type="button" className="ml-auto text-[11px] text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink" onClick={() => setShowRequest(!showRequest)}>
              {showRequest ? zh.a1.hideRequestJson : zh.a1.requestJson}
            </button>
          </section>
          {showRequest && (
            <pre className="num max-h-80 overflow-auto rounded-sm bg-ink p-3 text-[11px] leading-snug text-paper">
              {JSON.stringify({ state: parsedState.value, model: "jev-latest", questions }, null, 2)}
            </pre>
          )}
          {error && <div className="rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">{error}</div>}
        </div>

        <div className="space-y-4 lg:col-span-7">
          <section>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-ink-3">
              <span>{zh.a1.results}</span>
              {lastTrace && (
                <span className="flex items-center gap-3 normal-case tracking-normal">
                  <span className="num">{lastTrace.model}</span>
                  <LatencyChip ms={lastTrace.latencyMs} cached={lastTrace.cached} />
                  <span className="num">{lastTrace.response.usage.input_tokens} tok</span>
                  <span className="num">{fmtUsd(lastTrace.cost.usd)}</span>
                </span>
              )}
            </div>
            {!answers ? (
              <div className="rounded-md border border-dashed border-rule bg-panel/60 p-8 text-center text-sm text-ink-3">{zh.a1.noResults}</div>
            ) : (
              <div className="space-y-3">
                {orderedIds.map((id) => {
                  const q = questions?.[id];
                  const a = answers[id];
                  return q && a ? <AnswerCard key={id} id={id} question={q} answer={a} /> : null;
                })}
                {summary !== null && preset.summarize && (
                  <div className="hairline rounded-md bg-panel p-3 text-sm">
                    {preset.summarize.label_zh} = <span className="num font-medium text-jev">{summary}</span>
                  </div>
                )}
              </div>
            )}
          </section>
          <SavingsCard scenario="a1" jevTraces={traces} />
          <RequestInspector traces={traces} />
          <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
        </div>
      </div>
    </div>
  );
}
