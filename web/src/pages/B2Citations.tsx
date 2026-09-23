import { CANNED_CITATIONS, VERDICT_LABELS_ZH, type Citation, type ClaimVerdict, type ClaudeTierId, type JevTrace, type RfcSection, type Trace, type Verdict } from "@jev/shared";
import { useEffect, useMemo, useState } from "react";
import { ConfidenceRing } from "../components/ConfidenceRing";
import { LearningCard } from "../components/LearningCard";
import { ProbBars } from "../components/ProbBars";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtMs, fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface AnswerResponse {
  answer: string;
  claims: Citation[];
  tier: ClaudeTierId;
  cached: boolean;
  traces: Trace[];
}
interface VerifyResponse {
  results: ClaimVerdict[];
  traces: Trace[];
}

const PRESET_QUESTIONS = [
  "How does the exp claim handle clock skew?",
  "Which signing algorithms must every JWT implementation support?",
  "When a JWT is both signed and encrypted, which should happen first and why?",
  "Is the aud claim mandatory, and what happens if the recipient is not listed in it?",
  "How does a JWT indicate that its payload is itself another JWT?",
];

const VERDICT_TONE: Record<Verdict, string> = {
  verified: "bg-ok/10 text-ok",
  contradicted: "bg-bad/10 text-bad",
  unsupported: "bg-warn/15 text-warn",
  fabricated: "bg-claude-soft text-claude",
  misattributed: "bg-jev-soft text-jev",
};

const LEARNING = {
  proves: [
    "通用验证：生成者（Claude）与检验者（Jev）分离，用生成成本约 0.3% 的费用核查每条引用。",
    "先用代码做零成本的字符串匹配：捏造引文与误标章节根本不需要模型。",
    "一个三分类 Choice（支持 / 矛盾 / 无关）比 Noul 更能表达\"引文真实但说的是反话\"。",
  ],
  tryThis: [
    "勾选\"注入错误\"再生成：第 1 条会被换到相邻章节（误标），第 2 条引文首词被改成 Never（捏造）。",
    "把生成模型切到 Opus 5，比较引文的准确率与费用。",
    "问一个 RFC 没有回答的问题（如 \"How long should a refresh token live?\"），看回答与引用如何表现。",
  ],
  pitfalls: [
    "被截断或改写的引文会被判为捏造——这是字符串匹配的代价，也是要求 LLM 逐字引用的原因。",
    "置信度门限 0.8 是起点：先高后低，随着对结果的信任增加再放宽。",
    "章节太长时 Jev 的判断会受无关内容干扰（context rot）；本例章节最长约 2,500 字符。",
  ],
};

function highlight(text: string, quote: string): { before: string; hit: string; after: string } | null {
  const tokens = quote.trim().split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/["“”]/g, '["“”]').replace(/['‘’]/g, "['‘’]"));
  if (!tokens.length) return null;
  const re = new RegExp(tokens.join("\\s+"), "i");
  const m = re.exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index), hit: m[0], after: text.slice(m.index + m[0].length) };
}

export function B2Citations() {
  const { addTraces } = useSession();
  const [question, setQuestion] = useState(PRESET_QUESTIONS[0]!);
  const [tier, setTier] = useState<ClaudeTierId>("standard");
  const [inject, setInject] = useState(false);
  const [phase, setPhase] = useState<"idle" | "generating" | "verifying" | "done">("idle");
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [claims, setClaims] = useState<Citation[]>([]);
  const [results, setResults] = useState<ClaimVerdict[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sections, setSections] = useState<RfcSection[]>([]);

  useEffect(() => {
    void api.get<{ sections: RfcSection[] }>("/api/b2/sections").then((r) => setSections(r.sections)).catch(() => setSections([]));
  }, []);

  async function verify(list: Citation[]) {
    setPhase("verifying");
    const res = await api.post<VerifyResponse>("/api/b2/verify", { claims: list });
    setResults(res.results);
    setTraces((t) => [...t, ...res.traces]);
    addTraces(res.traces);
    setSelected(list[0]?.id ?? null);
    setPhase("done");
  }

  async function generate() {
    setError(null);
    setResults([]);
    setTraces([]);
    setPhase("generating");
    try {
      const res = await api.post<AnswerResponse>("/api/b2/answer", { question, tier, injectErrors: inject });
      setAnswer(res);
      setClaims(res.claims);
      setTraces(res.traces);
      addTraces(res.traces);
      await verify(res.claims);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function useCanned() {
    setError(null);
    setAnswer(null);
    setResults([]);
    setTraces([]);
    const list: Citation[] = CANNED_CITATIONS.map(({ id, claim, section_id, quote }) => ({ id, claim, section_id, quote }));
    setClaims(list);
    try {
      await verify(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setPhase("idle");
    }
  }

  const byId = useMemo(() => Object.fromEntries(results.map((r) => [r.id, r])), [results]);
  const selectedClaim = claims.find((c) => c.id === selected);
  const selectedVerdict = selected ? byId[selected] : undefined;
  const selectedSection = selectedClaim ? sections.find((s) => s.id === selectedClaim.section_id) : undefined;
  const hl = selectedClaim && selectedSection ? highlight(selectedSection.text, selectedClaim.quote) : null;
  const counts = useMemo(() => results.reduce<Partial<Record<Verdict, number>>>((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {}), [results]);
  const jevTraces = traces.filter((t): t is JevTrace => t.kind === "jev");
  const claudeTrace = traces.find((t) => t.kind === "claude");
  const jevUsd = jevTraces.reduce((s, t) => s + t.cost.usd, 0);

  return (
    <div className="rise mx-auto max-w-7xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl">{zh.b2.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.b2.intro}</p>
      </header>

      <section className="hairline mb-4 rounded-md bg-panel p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_QUESTIONS.map((q) => (
            <button key={q} type="button" onClick={() => setQuestion(q)} className={`hairline rounded-sm px-2 py-1 text-xs ${q === question ? "border-jev bg-jev-soft text-jev" : "bg-paper text-ink-2 hover:bg-paper-2"}`}>
              {q}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input className="hairline min-w-64 flex-1 rounded-sm bg-paper px-3 py-2 text-sm" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={zh.b2.question} />
          <select className="hairline rounded-sm bg-paper px-2 py-2 text-xs" value={tier} onChange={(e) => setTier(e.target.value as ClaudeTierId)}>
            <option value="standard">Claude Sonnet 5</option>
            <option value="strong">Claude Opus 5</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={inject} onChange={(e) => setInject(e.target.checked)} />
            {zh.b2.inject}
          </label>
          <button type="button" disabled={phase === "generating" || phase === "verifying" || !question.trim()} onClick={() => void generate()} className="rounded-md bg-claude px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {phase === "generating" ? zh.b2.generating : phase === "verifying" ? zh.b2.verifying : zh.b2.generate}
          </button>
          <button type="button" disabled={phase === "generating" || phase === "verifying"} onClick={() => void useCanned()} className="hairline rounded-md bg-paper px-3 py-2 text-xs text-ink-2 hover:bg-paper-2 disabled:opacity-40">
            {zh.b2.canned}
          </button>
        </div>
        {error && <div className="mt-3 rounded-md border border-bad/40 bg-bad/5 p-3 text-xs text-bad">{error}</div>}
      </section>

      {claims.length === 0 && phase === "idle" && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.b2.empty}</div>}

      {claims.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            {answer && (
              <section className="hairline rounded-md bg-panel p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-sm">{zh.b2.answer}</span>
                  <span className="num text-[11px] text-ink-3">
                    {answer.tier === "strong" ? "Claude Opus 5" : "Claude Sonnet 5"}
                    {claudeTrace && ` · ${fmtMs(claudeTrace.latencyMs)} · ${fmtUsd(claudeTrace.cost.usd)}`}
                    {answer.cached && ` ${zh.b2.cachedAnswer}`}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink">{answer.answer}</p>
              </section>
            )}

            <section className="hairline rounded-md bg-panel">
              <div className="flex items-center justify-between border-b border-rule px-4 py-2">
                <span className="font-display text-sm">{zh.b2.claims}</span>
                <span className="num flex flex-wrap gap-2 text-[11px]">
                  {(Object.keys(VERDICT_LABELS_ZH) as Verdict[]).filter((v) => counts[v]).map((v) => (
                    <span key={v} className={`rounded-sm px-1.5 py-0.5 ${VERDICT_TONE[v]}`}>
                      {VERDICT_LABELS_ZH[v]} {counts[v]}
                    </span>
                  ))}
                  {results.some((r) => r.review) && <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-ink-2">{zh.b2.review} {results.filter((r) => r.review).length}</span>}
                </span>
              </div>
              <ul className="divide-y divide-rule">
                {claims.map((c) => {
                  const v = byId[c.id];
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => setSelected(c.id)} className={`w-full px-4 py-3 text-left hover:bg-paper ${selected === c.id ? "bg-jev-soft/40" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex shrink-0 flex-col items-start gap-1">
                            {v ? (
                              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${v.review ? "bg-paper-2 text-ink-2" : VERDICT_TONE[v.verdict]}`}>{v.review ? `${VERDICT_LABELS_ZH[v.verdict]}？` : VERDICT_LABELS_ZH[v.verdict]}</span>
                            ) : (
                              <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-3">…</span>
                            )}
                            <span className="num text-[10px] text-ink-3">§{c.section_id}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink">{c.claim}</div>
                            <div className="mt-1 truncate text-xs text-ink-3">“{c.quote}”</div>
                            {v?.disagreement && <div className="mt-1 text-[11px] text-warn">{zh.b2.disagreement}</div>}
                            {v?.matchedIn && (
                              <div className="mt-1 text-[11px] text-jev">
                                {zh.b2.foundIn} §{v.matchedIn} 节
                              </div>
                            )}
                          </div>
                          {v?.relation && <ConfidenceRing value={v.relation.confidence} />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="hairline rounded-md bg-panel p-4">
              <div className="num grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <div className="text-[10px] text-ink-3">{zh.b2.costGen}</div>
                  <div className="text-base text-claude">{claudeTrace ? fmtUsd(claudeTrace.cost.usd) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-3">
                    {zh.b2.costVerify}（{jevTraces.length} 次）
                  </div>
                  <div className="text-base text-jev">{fmtUsd(jevUsd)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-3">字符串阶段判定</div>
                  <div className="text-base text-ink">{results.filter((r) => r.verdict === "fabricated" || r.verdict === "misattributed").length} 条 · $0</div>
                </div>
              </div>
            </section>
            <SavingsCard scenario="b2" jevTraces={jevTraces} />
          </div>

          <div className="space-y-4">
            <section className="hairline rounded-md bg-panel p-4">
              <div className="font-display text-sm">{zh.b2.section}</div>
              {!selectedClaim || !selectedSection ? (
                <p className="mt-2 text-sm text-ink-3">{zh.b2.pickClaim}</p>
              ) : (
                <>
                  <div className="num mt-1 text-xs text-ink-3">
                    §{selectedSection.id} {selectedSection.title}
                  </div>
                  {selectedVerdict && <div className="mt-2 text-xs text-ink-2">{selectedVerdict.reason_zh}</div>}
                  {selectedVerdict?.relation && (
                    <div className="mt-3">
                      <ProbBars probabilities={selectedVerdict.relation.probabilities} chosen={selectedVerdict.relation.choice} />
                      {selectedVerdict.quoteSupports !== undefined && <div className="num mt-2 text-xs text-ink-2">quote_supports = {selectedVerdict.quoteSupports.toFixed(2)}</div>}
                    </div>
                  )}
                  <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-sm bg-paper p-3 text-xs leading-relaxed text-ink-2">
                    {hl ? (
                      <>
                        {hl.before}
                        <mark className="rounded-sm bg-jev-soft px-0.5 text-ink">{hl.hit}</mark>
                        {hl.after}
                      </>
                    ) : (
                      <>
                        <span className="text-bad">{zh.b2.quote}未在本节找到：“{selectedClaim.quote}”</span>
                        {"\n\n"}
                        {selectedSection.text}
                      </>
                    )}
                  </pre>
                </>
              )}
            </section>
            <RequestInspector traces={traces} />
            <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
          </div>
        </div>
      )}
    </div>
  );
}
