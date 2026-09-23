import { B1_POLICIES, GUARDRAIL_MESSAGES, ROUTE_LABELS_ZH, decide, type Answers, type B1Decision, type B1PolicyId, type B1Route, type JevTrace, type Trace } from "@jev/shared";
import { useMemo, useState } from "react";
import { DecisionTrace, type B1Baseline } from "../components/DecisionTrace";
import { LearningCard } from "../components/LearningCard";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtPct, fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

interface B1Response {
  answers: Answers;
  decision: B1Decision;
  reply: { text: string; source: "canned" | "faq" | "claude"; tier?: string };
  baseline: B1Baseline;
  traces: Trace[];
  policy: B1PolicyId;
}

interface Turn {
  id: number;
  message: string;
  pending: boolean;
  error?: string;
  response?: B1Response;
}

const ROUTE_TONE: Record<B1Route, string> = {
  support: "bg-ok/10 text-ok",
  block: "bg-bad/10 text-bad",
  human: "bg-warn/15 text-warn",
  deterministic: "bg-paper-2 text-ink-2",
  sonnet: "bg-claude-soft text-claude",
  sonnet_caution: "bg-claude-soft text-claude",
  opus: "bg-claude-soft text-claude",
};

const LEARNING = {
  proves: [
    "Jev 作为 LLM 前面的分类器：一次请求 10 题，费用约为 Sonnet 5 做同样分类的 1%，延迟约 0.5s。",
    "护栏是并行的四个 Noul + 一个 Score，代码按顺序首中；越狱、自伤、要真人、FAQ 这些路由根本不需要调用 LLM。",
    "置信度门控：意图不明就转人工，而不是让模型硬猜。",
  ],
  tryThis: [
    "切到\"宽松\"策略，看 M13 越狱消息是否还会被拦截（act 从 0.70 升到 0.85）。",
    "把 M11（第二次故障投诉）多发几次，观察复杂度分数在人工与 Sonnet 之间的摇摆。",
    "自己写一条混合请求（如\"How do I reset my password, and also why was I charged twice?\"），看 is_compound 与路由。",
    "对比会话累计里的\"若全走 Opus 5\"与实际花费。",
  ],
  pitfalls: [
    "护栏不是安全边界：官方说明 Jev 对对抗内容不免疫，上线前要用边界样本测试。",
    "阈值随风险变化：拦截线 0.70、要真人 0.80、意图门限 0.50 都只是起点。",
    "同一条消息的分类概率会有小幅漂移（见 A4），靠近门限的消息可能在两次运行中走不同路由。",
  ],
};

export function B1Router() {
  const { addTraces } = useSession();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [policy, setPolicy] = useState<B1PolicyId>("strict");
  const [selected, setSelected] = useState<number | null>(null);
  const busy = turns.some((t) => t.pending);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    const id = Date.now();
    const recent = turns.slice(-2).map((t) => t.message);
    setTurns((ts) => [...ts, { id, message: text, pending: true }]);
    setInput("");
    try {
      const res = await api.post<B1Response>("/api/b1/message", { message: text, recent_context: recent, policy });
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, pending: false, response: res } : t)));
      addTraces(res.traces);
      setSelected(id);
    } catch (e) {
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, pending: false, error: e instanceof ApiError ? e.message : String(e) } : t)));
    }
  }

  const totals = useMemo(() => {
    const done = turns.filter((t) => t.response);
    const jev = done.reduce((s, t) => s + (t.response!.traces.find((x) => x.kind === "jev")?.cost.usd ?? 0), 0);
    const claude = done.reduce((s, t) => s + t.response!.baseline.actualClaudeUsd, 0);
    const allOpus = done.reduce((s, t) => s + t.response!.baseline.allOpusUsd, 0);
    const guard = done.reduce((s, t) => s + t.response!.baseline.sonnetGuardUsd, 0);
    return { n: done.length, actual: jev + claude, jev, claude, allOpus, guard };
  }, [turns]);

  const selectedTurn = turns.find((t) => t.id === selected);
  const jevTraces = useMemo(() => turns.flatMap((t) => (t.response?.traces ?? []).filter((x): x is JevTrace => x.kind === "jev")), [turns]);
  const allTraces = useMemo(() => turns.flatMap((t) => t.response?.traces ?? []), [turns]);
  const grouped = useMemo(() => {
    const m = new Map<B1Route, typeof GUARDRAIL_MESSAGES>();
    for (const msg of GUARDRAIL_MESSAGES) {
      const k = msg.expected_routes[0]!;
      m.set(k, [...(m.get(k) ?? []), msg]);
    }
    return m;
  }, []);

  return (
    <div className="rise mx-auto max-w-7xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl">{zh.b1.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.b1.intro}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="hairline rounded-md bg-panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.b1.policy}</span>
              <div className="flex overflow-hidden rounded-sm border border-rule text-xs">
                {(["strict", "permissive"] as B1PolicyId[]).map((p) => (
                  <button key={p} type="button" onClick={() => setPolicy(p)} className={`px-3 py-1 ${policy === p ? "bg-jev text-white" : "bg-paper text-ink-2"}`}>
                    {p === "strict" ? zh.b1.strict : zh.b1.permissive} · act {B1_POLICIES[p].act}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.b1.canned}</div>
            <div className="mt-1 space-y-2">
              {[...grouped.entries()].map(([route, msgs]) => (
                <div key={route}>
                  <div className={`mb-1 inline-block rounded-sm px-1.5 py-0.5 text-[10px] ${ROUTE_TONE[route]}`}>{ROUTE_LABELS_ZH[route]}</div>
                  <div className="flex flex-wrap gap-1">
                    {msgs.map((m) => (
                      <button key={m.id} type="button" disabled={busy} onClick={() => void send(m.text)} title={m.note_zh} className="hairline max-w-full truncate rounded-sm bg-paper px-2 py-1 text-left text-xs text-ink-2 hover:bg-paper-2 disabled:opacity-40">
                        <span className="num mr-1 text-ink-3">{m.id}</span>
                        {m.text}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="hairline flex min-h-72 flex-col rounded-md bg-panel">
            <div className="flex-1 space-y-3 p-4">
              {turns.length === 0 && <div className="py-10 text-center text-sm text-ink-3">{zh.b1.empty}</div>}
              {turns.map((t) => {
                const d = t.response?.decision;
                const would = t.response ? decide(t.response.answers, B1_POLICIES[policy]) : null;
                const changed = d && would && would.route !== d.route;
                return (
                  <div key={t.id} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-md bg-ink px-3 py-2 text-sm text-paper">{t.message}</div>
                    </div>
                    <div className="flex justify-start">
                      <button type="button" onClick={() => setSelected(t.id)} className={`hairline max-w-[90%] rounded-md bg-paper px-3 py-2 text-left text-sm ${selected === t.id ? "border-jev" : ""}`}>
                        {t.pending && <span className="text-ink-3">{zh.b1.pending}</span>}
                        {t.error && <span className="text-bad">{t.error}</span>}
                        {t.response && d && (
                          <>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${ROUTE_TONE[d.route]}`}>{ROUTE_LABELS_ZH[d.route]}</span>
                              <span className="num text-[10px] text-ink-3">{t.response.policy}</span>
                              {changed && (
                                <span className="num text-[10px] text-warn">
                                  {zh.b1.wouldRoute} {ROUTE_LABELS_ZH[would!.route]}
                                </span>
                              )}
                            </div>
                            <div className="text-ink">{t.response.reply.text}</div>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="flex gap-2 border-t border-rule p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input className="hairline flex-1 rounded-sm bg-paper px-3 py-2 text-sm" placeholder={zh.b1.placeholder} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-md bg-jev px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                {zh.b1.send}
              </button>
            </form>
          </section>

          {totals.n > 0 && (
            <section className="hairline rounded-md bg-panel p-4">
              <div className="font-display text-sm">{zh.b1.totals}</div>
              <div className="num mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <Figure label={`${zh.b1.actual}（Jev + Claude）`} value={fmtUsd(totals.actual)} sub={`Jev ${fmtUsd(totals.jev)} · Claude ${fmtUsd(totals.claude)}`} tone="text-ink" />
                <Figure label={zh.b1.baselineOpus} value={fmtUsd(totals.allOpus)} sub={totals.allOpus > 0 ? `${zh.b1.saved} ${fmtPct(Math.max(0, (1 - totals.actual / totals.allOpus) * 100))}` : ""} tone="text-claude" />
                <Figure label={zh.b1.baselineGuard} value={fmtUsd(totals.guard)} sub={totals.guard > 0 ? `vs Jev ${fmtUsd(totals.jev)} · ${Math.round(totals.guard / Math.max(totals.jev, 1e-9))}×` : ""} tone="text-claude" />
                <Figure label="轮次" value={String(totals.n)} sub="" tone="text-ink" />
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{zh.b1.trace}</div>
          {selectedTurn?.response ? (
            <DecisionTrace answers={selectedTurn.response.answers} decision={decide(selectedTurn.response.answers, B1_POLICIES[selectedTurn.response.policy])} traces={selectedTurn.response.traces} baseline={selectedTurn.response.baseline} />
          ) : (
            <div className="rounded-md border border-dashed border-rule bg-panel/60 p-8 text-center text-sm text-ink-3">{zh.b1.selectTurn}</div>
          )}
          <SavingsCard scenario="b1" jevTraces={jevTraces} />
          <RequestInspector traces={allTraces} />
          <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div>
      <div className="text-[10px] text-ink-3">{label}</div>
      <div className={`text-base ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-3">{sub}</div>}
    </div>
  );
}
