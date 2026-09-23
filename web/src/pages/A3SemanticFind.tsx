import { A3_LINES, A3_PRESET_QUERIES, A3_STATUS_ZH, A3_THRESHOLDS, lineId, type A3Result, type A3Status, type Answers, type JevTrace } from "@jev/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { LatencyChip } from "../components/LatencyChip";
import { LearningCard } from "../components/LearningCard";
import { NoulMeter } from "../components/NoulMeter";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface SearchResponse {
  query: string;
  answers: Answers;
  result: A3Result;
  traces: JevTrace[];
  lineCount: number;
}

const STATUS_TONE: Record<A3Status, string> = {
  answered: "bg-ok/10 text-ok border-ok/30",
  partial: "bg-warn/15 text-warn border-warn/30",
  absent: "bg-bad/10 text-bad border-bad/30",
};

const LEARNING = {
  proves: [
    "一个 Choice 就是一次交叉编码级的相关度打分：218 行各得一个概率，不需要 embedding、索引或生成。",
    "Choice 的概率和恒为 1，它永远会\"选出\"一行——必须配一个存在性 Noul 才能说\"文档未涉及\"。",
    "整篇文档（约 12k tokens）作为 state 一次发送；Choice 的 255 选项上限决定了单次能覆盖的行数。",
  ],
  tryThis: [
    "问一个文档里没有的问题（如仲裁条款），比较 exists 与 top 概率：Choice 仍会给出一行，exists 会说不。",
    "把示例查询改一个词（who owns → who licenses），看概率分布如何在几行之间移动。",
    "打开\"忽略 exists\"，体会没有存在性判断时检索结果有多误导。",
  ],
  pitfalls: [
    "每次查询都发整篇文档：约 12k tokens、$0.0005。相对向量检索 Jev 并不省钱，优势是零索引、可解释、无冷启动。",
    "超过 255 行的文档要分段（或先按段落粗筛再逐行）；行越长、越多，无关内容对判断的干扰越大。",
    "Jev 按字面理解：问法里的措辞会直接影响它挑哪一行，先在小样本上调好问法。",
  ],
};

function heat(prob: number, top: number): string | undefined {
  if (prob < A3_THRESHOLDS.minShow || top <= 0) return undefined;
  const alpha = 0.1 + 0.75 * Math.min(1, prob / top);
  return `rgb(from var(--color-jev) r g b / ${alpha.toFixed(3)})`;
}

export function A3SemanticFind() {
  const { addTraces } = useSession();
  const [query, setQuery] = useState(A3_PRESET_QUERIES[0]!.query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naive, setNaive] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [history, setHistory] = useState<JevTrace[]>([]);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listRef = useRef<HTMLOListElement | null>(null);

  const probs = useMemo(() => {
    const w = data?.answers.where;
    return w && w.type === "choice" ? w.probabilities : {};
  }, [data]);
  const top = data?.result.naiveTop?.prob ?? 0;
  const highlighted = useMemo(() => new Set((data?.result.ranked ?? []).slice(0, data?.result.highlightCount ?? 0).map((r) => r.index)), [data]);

  /** Scroll only the document pane (not the page) so the query bar and verdict stay in view. */
  const scrollTo = (index: number) => {
    const list = listRef.current;
    const li = lineRefs.current[index];
    if (!list || !li) return;
    list.scrollTo({ top: li.offsetTop - list.clientHeight / 2 + li.offsetHeight / 2, behavior: "smooth" });
  };

  useEffect(() => {
    const best = data?.result.ranked[0];
    if (best) scrollTo(best.index);
  }, [data]);

  async function run(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SearchResponse>("/api/a3/search", { query: text });
      setData(res);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const trace = data?.traces[0];
  const result = data?.result;

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.a3.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{zh.a3.intro}</p>
      </header>

      <section className="hairline mb-4 rounded-md bg-panel p-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query);
          }}
        >
          <input className="hairline min-w-72 flex-1 rounded-sm bg-paper px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={zh.a3.query} maxLength={200} />
          <button type="submit" disabled={busy || !query.trim()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy ? zh.a3.searching : zh.a3.search}
          </button>
          <label className="ml-2 flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={naive} onChange={(e) => setNaive(e.target.checked)} />
            {zh.a3.naive}
          </label>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{zh.a3.presets}</span>
          {A3_PRESET_QUERIES.map((p) => (
            <button
              key={p.query}
              type="button"
              title={p.note_zh}
              disabled={busy}
              onClick={() => {
                setQuery(p.query);
                void run(p.query);
              }}
              className={`hairline rounded-full px-2.5 py-1 text-xs hover:bg-jev-soft ${data?.query === p.query ? "bg-jev-soft text-jev" : "bg-paper text-ink-2"}`}
            >
              {p.query}
            </button>
          ))}
        </div>
        {error && <div className="mt-3 rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!data && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.a3.empty}</div>}

      {data && result && trace && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="hairline rounded-md bg-panel lg:col-span-2">
            <div className="flex items-center justify-between border-b border-rule px-4 py-2 text-xs text-ink-3">
              <span>
                {zh.a3.document} · GitHub Terms of Service · {data.lineCount} {zh.a3.lines}
              </span>
              <span className="num">
                {zh.a3.highlight} top-{result.highlightCount}
              </span>
            </div>
            <ol ref={listRef} className="relative max-h-[70vh] overflow-y-auto p-2 font-mono text-[12px] leading-relaxed">
              {A3_LINES.map((text, i) => {
                const id = lineId(i);
                const p = probs[id] ?? 0;
                const bg = heat(p, top);
                const outlined = highlighted.has(i);
                return (
                  <li
                    key={id}
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    className={`flex gap-3 rounded-sm px-2 py-0.5 ${outlined ? "ring-2 ring-jev" : ""}`}
                    style={bg ? { backgroundColor: bg, color: p / top > 0.6 ? "#fffdf9" : undefined } : undefined}
                  >
                    <span className={`num w-10 shrink-0 ${bg && p / top > 0.6 ? "text-white/80" : "text-ink-3"}`}>{id}</span>
                    <span className={`flex-1 whitespace-pre-wrap ${text.trim() === "" ? "text-ink-3" : ""}`}>{text || " "}</span>
                    {p >= A3_THRESHOLDS.minShow && <span className="num shrink-0 text-[11px]">{p.toFixed(2)}</span>}
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="space-y-4">
            <section className="hairline rounded-md bg-panel p-4">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.a3.verdict}</div>
              {naive ? (
                <div className="mt-2">
                  <div className="inline-flex items-center gap-2 rounded-md border border-claude/30 bg-claude-soft px-3 py-1.5 text-sm text-claude">
                    {zh.a3.naiveVerdict} <span className="num font-medium">{result.naiveTop?.lineId ?? "—"}</span>
                    <span className="num text-xs">{result.naiveTop ? result.naiveTop.prob.toFixed(2) : ""}</span>
                  </div>
                  <p className="mt-2 text-xs text-ink-2">{zh.a3.naiveNote}</p>
                </div>
              ) : (
                <div className={`mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${STATUS_TONE[result.status]}`}>
                  <span className="font-medium">{A3_STATUS_ZH[result.status]}</span>
                  <span className="num text-xs">exists {result.exists.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-4">
                <div className="mb-1 text-xs text-ink-2">{zh.a3.exists}</div>
                <NoulMeter value={result.exists} no={A3_THRESHOLDS.absent} yes={A3_THRESHOLDS.found} />
              </div>
              <div className="mt-4 flex items-baseline justify-between text-xs text-ink-2">
                <span>{zh.a3.spans}</span>
                <span className="num text-ink">
                  {result.spansMultiple.toFixed(2)} → top-{result.highlightCount}
                </span>
              </div>
            </section>

            <section className="hairline rounded-md bg-panel p-4">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.a3.top}</div>
              <ol className="mt-2 space-y-1.5">
                {result.ranked.map((r) => (
                  <li key={r.lineId}>
                    <button type="button" onClick={() => scrollTo(r.index)} className="flex w-full items-start gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-jev-soft">
                      <span className="num w-9 shrink-0 text-jev">{r.lineId}</span>
                      <span className="num w-9 shrink-0 text-ink">{r.prob.toFixed(2)}</span>
                      <span className="line-clamp-2 flex-1 text-ink-2">{r.text}</span>
                    </button>
                  </li>
                ))}
                {result.ranked.length === 0 && <li className="text-xs text-ink-3">—</li>}
              </ol>
            </section>

            <section className="hairline flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3 text-xs text-ink-2">
              <LatencyChip ms={trace.latencyMs} cached={trace.cached} />
              <span className="num">
                {trace.response.usage.input_tokens.toLocaleString()} {zh.a3.tokens}
              </span>
              <span className="num">{fmtUsd(trace.cost.usd)}</span>
              <span className="num text-ink-3">{trace.model}</span>
            </section>

            <SavingsCard scenario="a3" jevTraces={history} />
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
