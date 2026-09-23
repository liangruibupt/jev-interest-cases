import { B3_PRESET_QUERIES, B3_ROUTE_LABELS_ZH, B3_THRESHOLDS, type B3Retrieved, type B3Route, type ClaudeTierId, type Passage, type Trace } from "@jev/shared";
import { useMemo, useState } from "react";
import { LatencyChip } from "../components/LatencyChip";
import { LearningCard } from "../components/LearningCard";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface AskResponse {
  query: string;
  gatekeeper: boolean;
  tier: ClaudeTierId;
  retrieved: B3Retrieved[];
  prompt: string;
  promptChars: { gated: number | null; raw: number };
  answer: string;
  answerCached: boolean;
  traces: Trace[];
}

const ROUTE_TONE: Record<B3Route, string> = {
  accepted: "bg-ok/10 text-ok",
  conflicting: "bg-warn/15 text-warn",
  excluded_injection: "bg-bad/10 text-bad",
  excluded_irrelevant: "bg-paper-2 text-ink-3",
  excluded_no_evidence: "bg-paper-2 text-ink-3",
};
const SOURCE_TONE: Record<Passage["source_type"], string> = {
  rfc: "bg-jev-soft text-jev",
  forum: "bg-bad/10 text-bad",
  blog: "bg-claude-soft text-claude",
};

const LEARNING = {
  proves: [
    "Jev 在检索与生成之间做证据筛选：4 个 Noul、每段一次请求，把无关段、无证据段和提示注入段挡在 Claude 之外。",
    "\"反驳前提\"这个 Noul 让 LLM 敢于纠正错误问题，而不是顺着错误前提编答案。",
    "守门费用只是生成费用的几个百分点；同时 prompt 变短，生成本身也更便宜、更准。",
  ],
  tryThis: [
    "选第 3 个示例，先开守门人看论坛段被红色芯片排除，再关掉守门人对比 Claude 的回答。",
    "问一个错误前提的问题（第 4、5 个示例），看哪一段被标成冲突证据、Claude 是否先纠正前提。",
    "把生成模型切到 Opus 5：守门成本不变，生成成本约 2.5 倍。",
  ],
  pitfalls: [
    "守门人判断相关性、证据与前提冲突，不判断真伪：博客说 exp 必填时 Jev 不会知道它错了，只能靠 source_type 让 Claude 优先 RFC。",
    "注入检测不是安全边界：官方明确 Jev 对对抗性内容并不免疫；把它当作一层过滤而不是唯一防线。",
    "每段一次请求（10 段 ≈ 10 次调用、约 7k tokens）：文档警告过把多段塞进一个 state 会互相干扰（context rot）。",
  ],
};

function MiniNoul({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]" title={`${label} = ${value.toFixed(3)}`}>
      <span className="w-14 shrink-0 text-ink-3">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-[3px] bg-paper-2">
        <div className={`absolute inset-y-0 left-0 rounded-[3px] ${alarm ? "bg-bad" : "bg-jev"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className={`num w-8 text-right ${alarm ? "text-bad" : "text-ink"}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export function B3Rag() {
  const { addTraces } = useSession();
  const [query, setQuery] = useState(B3_PRESET_QUERIES[2]!.query);
  const [gatekeeper, setGatekeeper] = useState(true);
  const [tier, setTier] = useState<ClaudeTierId>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AskResponse | null>(null);
  const [history, setHistory] = useState<Trace[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  async function run(q: string, gate = gatekeeper) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AskResponse>("/api/b3/ask", { query: text, gatekeeper: gate, tier });
      setData(res);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c = { accepted: 0, conflicting: 0, excluded: 0 };
    for (const r of data?.retrieved ?? []) {
      if (!r.gate) continue;
      if (r.gate.route === "accepted") c.accepted += 1;
      else if (r.gate.route === "conflicting") c.conflicting += 1;
      else c.excluded += 1;
    }
    return c;
  }, [data]);
  const jevTraces = useMemo(() => history.filter((t) => t.kind === "jev"), [history]);
  const jevNow = data?.traces.filter((t) => t.kind === "jev") ?? [];
  const claudeNow = data?.traces.find((t) => t.kind === "claude");

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.b3.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.b3.intro}</p>
      </header>

      <section className="hairline mb-4 rounded-md bg-panel p-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query);
          }}
        >
          <input className="hairline min-w-72 flex-1 rounded-sm bg-paper px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={zh.b3.query} maxLength={300} />
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={gatekeeper} onChange={(e) => setGatekeeper(e.target.checked)} />
            {zh.b3.gatekeeper}
          </label>
          <select className="hairline rounded-sm bg-paper px-2 py-2 text-xs" value={tier} onChange={(e) => setTier(e.target.value as ClaudeTierId)} title={zh.b3.tier}>
            <option value="standard">Claude Sonnet 5</option>
            <option value="strong">Claude Opus 5</option>
          </select>
          <button type="submit" disabled={busy || !query.trim()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy ? zh.b3.asking : zh.b3.ask}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{zh.b3.presets}</span>
          {B3_PRESET_QUERIES.map((p, i) => (
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
              <span className="num mr-1 text-ink-3">{i + 1}</span>
              {p.query}
              {p.falsePremise && <span className="ml-1 text-warn">⚠</span>}
            </button>
          ))}
        </div>
        {error && <div className="mt-3 rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!data && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.b3.empty}</div>}

      {data && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="hairline rounded-md bg-panel lg:col-span-3">
            <div className="flex items-center justify-between border-b border-rule px-4 py-2 text-xs text-ink-3">
              <span>{zh.b3.retrieved}</span>
              {data.gatekeeper ? (
                <span className="flex gap-2">
                  <span className="rounded-sm bg-ok/10 px-1.5 text-ok">
                    {zh.b3.accepted} <span className="num">{counts.accepted}</span>
                  </span>
                  <span className="rounded-sm bg-warn/15 px-1.5 text-warn">
                    {zh.b3.conflicting} <span className="num">{counts.conflicting}</span>
                  </span>
                  <span className="rounded-sm bg-paper-2 px-1.5 text-ink-3">
                    {zh.b3.excluded} <span className="num">{counts.excluded}</span>
                  </span>
                </span>
              ) : (
                <span className="rounded-sm bg-claude-soft px-1.5 text-claude">{zh.b3.ungated}</span>
              )}
            </div>
            <ol className="divide-y divide-rule">
              {data.retrieved.map((r, i) => {
                const g = r.gate;
                const isOpen = open === r.passage.id;
                return (
                  <li key={r.passage.id} className="px-4 py-2.5">
                    <button type="button" onClick={() => setOpen(isOpen ? null : r.passage.id)} className="flex w-full items-center gap-2 text-left text-xs">
                      <span className="num w-4 text-ink-3">{i + 1}</span>
                      <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${SOURCE_TONE[r.passage.source_type]}`}>{zh.b3.source[r.passage.source_type]}</span>
                      <span className="flex-1 truncate text-ink">{r.passage.title}</span>
                      <span className="num text-ink-3">bm25 {r.bm25.toFixed(1)}</span>
                      {g ? (
                        <span className={`rounded-sm px-1.5 py-0.5 text-[11px] ${ROUTE_TONE[g.route]}`} title={g.rule_zh}>
                          {B3_ROUTE_LABELS_ZH[g.route]}
                        </span>
                      ) : r.error ? (
                        <span className="rounded-sm bg-bad/10 px-1.5 py-0.5 text-[11px] text-bad" title={r.error}>
                          Jev 失败
                        </span>
                      ) : (
                        <span className="rounded-sm bg-claude-soft px-1.5 py-0.5 text-[11px] text-claude">→ Claude</span>
                      )}
                    </button>
                    {g && (
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        <MiniNoul label={zh.b3.relevant} value={g.values.relevant} alarm={g.values.relevant < B3_THRESHOLDS.relevantMin} />
                        <MiniNoul label={zh.b3.evidence} value={g.values.evidence} />
                        <MiniNoul label={zh.b3.contradicts} value={g.values.contradicts} alarm={g.values.contradicts >= B3_THRESHOLDS.contradictsMin} />
                        <MiniNoul label={zh.b3.injection} value={g.values.injection} alarm={g.values.injection > B3_THRESHOLDS.injectionMax} />
                      </div>
                    )}
                    {isOpen && <p className="mt-2 whitespace-pre-wrap rounded-sm bg-paper p-2 font-mono text-[11px] leading-relaxed text-ink-2">{r.passage.text}</p>}
                  </li>
                );
              })}
              {data.retrieved.length === 0 && <li className="px-4 py-6 text-center text-xs text-ink-3">—</li>}
            </ol>
          </section>

          <div className="space-y-4 lg:col-span-2">
            <section className="hairline rounded-md bg-panel p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.b3.answer}</div>
                <span className="rounded-sm bg-claude-soft px-1.5 py-0.5 text-[11px] text-claude">{data.tier === "strong" ? "Claude Opus 5" : "Claude Sonnet 5"}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{data.answer}</p>
              {data.answerCached && <p className="mt-2 text-[11px] text-ink-3">{zh.b3.cachedAnswer}</p>}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-ink-3">
                  {zh.b3.prompt} · <span className="num">{data.prompt.length}</span> chars
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-sm bg-paper p-2 font-mono text-[11px] leading-relaxed text-ink-2">{data.prompt}</pre>
              </details>
            </section>

            <section className="hairline rounded-md bg-panel p-4 text-xs text-ink-2">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  {zh.b3.costJev} <span className="num text-jev">{fmtUsd(jevNow.reduce((s, t) => s + t.cost.usd, 0))}</span>
                  <span className="num text-ink-3"> · {jevNow.length} 次</span>
                </span>
                {jevNow[0] && <LatencyChip ms={Math.max(...jevNow.map((t) => t.latencyMs))} cached={jevNow.every((t) => t.cached)} />}
                <span>
                  {zh.b3.costClaude} <span className="num text-claude">{claudeNow ? fmtUsd(claudeNow.cost.usd) : "—"}</span>
                </span>
                {claudeNow && <LatencyChip ms={claudeNow.latencyMs} kind="claude" />}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                <span>
                  {zh.b3.promptChars}：{zh.b3.gated} <span className="num text-ink">{data.promptChars.gated === null ? "—" : data.promptChars.gated.toLocaleString()}</span> · {zh.b3.raw}{" "}
                  <span className="num text-ink">{data.promptChars.raw.toLocaleString()}</span>
                </span>
              </div>
            </section>

            <SavingsCard scenario="b3" jevTraces={jevTraces} />
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
