import { ALARM_LABELS_ZH, C4_NOT_ASKED, C4_ROUTE_LABELS_ZH, C4_THRESHOLDS, NOTICE_TYPE_LABELS_ZH, VPP_NOTICES, VPP_SITES, applyNotice, type Answers, type C4Route, type C4Thresholds, type JevTrace, type PairDecision, type Trace } from "@jev/shared";
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

interface ApplyResponse {
  results: Record<string, { answers: Answers; traceId: string }>;
  errors: Record<string, string>;
  traces: JevTrace[];
}

const ROUTE_TONE: Record<C4Route, string> = {
  act_now: "bg-bad/10 text-bad border-bad/30",
  alarm: "bg-bad/10 text-bad border-bad/30",
  schedule: "bg-warn/15 text-warn border-warn/30",
  review: "bg-claude-soft text-claude border-claude/30",
  acknowledge_test: "bg-jev-soft text-jev border-jev/30",
  info: "bg-ok/10 text-ok border-ok/30",
  not_applicable: "bg-paper-2 text-ink-3 border-rule",
};
const URGENCY_LEGEND: Record<string, string> = { "0": "仅告知，无期限", "1": "几天内需行动", "2": "现在或数小时内需行动" };
const ASSET_ZH: Record<string, string> = { battery_storage: "电池储能", solar_plus_storage: "光储", demand_response_load: "需求响应负荷" };
const key = (n: string, s: string) => `${n}:${s}`;

const LEARNING = {
  proves: [
    "\"这份通知是否适用于本站点\"是文字判断：区域词、资产词、是否点名、是否要求行动，每对一次请求、8 题，约 500 tokens。",
    "数字全部在代码里：≥ 1 MW 与站点 2 MW / 800 kW 的比较、50% 限出力、16:00–19:00 时间窗都由正则解析，Jev 只判断词。",
    "同一条通知对三个站点给出不同路由——这是聚合商每天要做的事，用 Jev 一次请求 $0.00002 就能做一对。",
  ],
  tryThis: [
    "看 N02（≥ 1 MW 的测试）：S1 测试确认、S2 因代码比较 800 kW < 1 MW 不适用、S3 不是调频资源。",
    "把\"适用 / 行动 Noul ≥\"拉到 0.9，看哪些格从仅告知 / 排期掉进复核。",
    "看 N12：通知明说电池与光伏无需行动，applies_asset 对 S1 / S2 应接近 0；再看 N01 里\"demand response loads\"对电池站点 S1 的判断。",
  ],
  pitfalls: [
    "这是演示数据：真实调度通知有固定格式，先按格式提取字段（代码），再让 Jev 判断自然语言部分。",
    "Jev 不做调度决策：放电与否、报价多少属于优化与合约。",
    "容量门槛的解析是正则：\"at least 1 MW\" 能抓到，\"one megawatt\" 抓不到——文本一变要补规则。",
  ],
};

function MiniNoul({ label, value, act, review }: { label: string; value: number; act: number; review: number }) {
  const tone = value >= act ? "text-ok" : value >= review ? "text-warn" : "text-ink-3";
  return (
    <div className="flex items-center gap-2 text-[11px]" title={`${label} = ${value.toFixed(3)}`}>
      <span className="w-24 shrink-0 text-ink-3">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-[3px] bg-paper-2">
        <div className={`absolute inset-y-0 left-0 rounded-[3px] ${value >= act ? "bg-ok" : value >= review ? "bg-warn" : "bg-rule"}`} style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${review * 100}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${act * 100}%` }} />
      </div>
      <span className={`num w-8 text-right ${tone}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export function C4Vpp() {
  const { addTraces } = useSession();
  const [results, setResults] = useState<ApplyResponse["results"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState<C4Thresholds>({ ...C4_THRESHOLDS });

  const decisions = useMemo(() => {
    if (!results) return {};
    const out: Record<string, PairDecision> = {};
    for (const n of VPP_NOTICES) for (const s of VPP_SITES) {
      const r = results[key(n.id, s.id)];
      if (r) out[key(n.id, s.id)] = applyNotice(r.answers, n, s, t);
    }
    return out;
  }, [results, t]);
  const jevTraces = useMemo(() => history.filter((x): x is JevTrace => x.kind === "jev"), [history]);

  async function applyAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ApplyResponse>("/api/c4/apply", { live });
      setResults(res.results);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
      if (Object.keys(res.errors).length) setError(Object.entries(res.errors).map(([k, e]) => `${k}: ${e}`).join("；"));
      if (!selected) setSelected(key("N02", "S2"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const [selN, selS] = selected ? selected.split(":") : [undefined, undefined];
  const notice = VPP_NOTICES.find((n) => n.id === selN);
  const site = VPP_SITES.find((s) => s.id === selS);
  const d = selected ? decisions[selected] : undefined;
  const selAnswers = selected ? results?.[selected]?.answers : undefined;
  const urgencyProbs = selAnswers?.urgency?.type === "score" ? selAnswers.urgency.probabilities : {};

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.c4.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.c4.intro}</p>
      </header>

      <section className="hairline mb-4 flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3">
        <button type="button" disabled={busy} onClick={() => void applyAll()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
          {busy ? zh.c4.applying : zh.c4.applyAll}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {zh.c4.live}
        </label>
        <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.thresholds}</span>
        <div className="flex flex-wrap gap-4">
          <ThresholdSlider label={zh.c4.act} value={t.act} min={0.5} max={0.95} step={0.05} onChange={(v) => setT((p) => ({ ...p, act: v }))} />
          <ThresholdSlider label={zh.c4.urgencyNow} value={t.urgencyNow} min={0.5} max={2} step={0.1} onChange={(v) => setT((p) => ({ ...p, urgencyNow: v }))} />
        </div>
        {error && <div className="w-full rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!results && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.c4.empty}</div>}

      {results && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="hairline overflow-x-auto rounded-md bg-panel lg:col-span-3">
            <table className="w-full text-xs">
              <thead className="text-[11px] text-ink-3">
                <tr className="border-b border-rule">
                  <th className="px-3 py-2 text-left uppercase tracking-wider">{zh.c4.notice}</th>
                  {VPP_SITES.map((s) => (
                    <th key={s.id} className="px-2 py-2 text-left">
                      <div className="text-ink">{s.name}</div>
                      <div className="num">{s.region} · {ASSET_ZH[s.asset_type]} · {s.capacity_kw} kW</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VPP_NOTICES.map((n) => (
                  <tr key={n.id} className="border-b border-rule/60 align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="num text-ink-3">{n.id}</span>
                        <span className="rounded-sm bg-paper-2 px-1 text-[10px] text-ink-3">{zh.c4.from[n.from]}</span>
                      </div>
                      <p className="mt-1 line-clamp-3 max-w-md text-ink">{n.text}</p>
                    </td>
                    {VPP_SITES.map((s) => {
                      const k = key(n.id, s.id);
                      const dd = decisions[k];
                      const isSel = selected === k;
                      return (
                        <td key={s.id} className="px-2 py-2">
                          {dd ? (
                            <button type="button" onClick={() => setSelected(k)} className={`w-full rounded-md border px-2 py-1.5 text-left ${ROUTE_TONE[dd.route]} ${isSel ? "ring-2 ring-jev" : ""}`}>
                              <div className="font-medium">{C4_ROUTE_LABELS_ZH[dd.route]}</div>
                              <div className="num text-[10px] opacity-80">
                                适用 {dd.applies.toFixed(2)}
                                {dd.constraints.some((c) => c.satisfied === false) ? " · 容量✗" : ""}
                              </div>
                            </button>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="space-y-4 lg:col-span-2">
            {notice && site && d ? (
              <section className="hairline rounded-md bg-panel p-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3">
                    {notice.id} × {site.name}
                  </div>
                  <span className={`rounded-sm border px-1.5 py-0.5 ${ROUTE_TONE[d.route]}`}>{C4_ROUTE_LABELS_ZH[d.route]}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{notice.text}</p>
                <p className="mt-1 text-[11px] text-ink-3">
                  {zh.c4.site}：{site.name} · {site.region} · {ASSET_ZH[site.asset_type]} · {site.capacity_kw} kW · {zh.c4.expected}：{(notice.expected[site.id] ?? []).map((r) => C4_ROUTE_LABELS_ZH[r]).join(" / ")}
                </p>
                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.rule}</div>
                <p className="mt-1 text-ink">{d.rule_zh}</p>
                {d.reasons.length > 0 && <p className="num mt-0.5 text-ink-3">{d.reasons.join(" · ")}</p>}

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.constraints}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.constraints.length === 0 && <span className="text-ink-3">{zh.c4.noConstraints}</span>}
                  {d.constraints.map((c, i) => (
                    <span key={`${c.kind}-${i}`} className={`num rounded-sm px-1.5 py-0.5 ${c.satisfied === false ? "bg-bad/10 text-bad" : c.satisfied === true ? "bg-ok/10 text-ok" : "bg-paper-2 text-ink-2"}`}>
                      {c.text}
                      {c.kind === "min_capacity_kw" ? ` → ${c.satisfied ? zh.c4.satisfied : zh.c4.unsatisfied}（${site.capacity_kw} kW）` : ""}
                    </span>
                  ))}
                </div>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.applicability}</div>
                <div className="mt-1 space-y-1">
                  <MiniNoul label={zh.c4.appliesRegion} value={d.appliesRegion} act={t.act} review={t.review} />
                  <MiniNoul label={zh.c4.appliesAsset} value={d.appliesAsset} act={t.act} review={t.review} />
                  <MiniNoul label={zh.c4.namesSite} value={d.namesSite} act={t.act} review={t.review} />
                  <MiniNoul label={zh.c4.requiresAction} value={d.requiresAction} act={t.act} review={t.review} />
                  <MiniNoul label={zh.c4.isTest} value={d.isTest} act={t.act} review={t.review} />
                </div>

                {d.noticeType && (
                  <>
                    <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.noticeType}</div>
                    <div className="mt-1 flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={Object.fromEntries(Object.entries(d.noticeType.probabilities).filter(([, p]) => p >= 0.01).map(([k2, p]) => [NOTICE_TYPE_LABELS_ZH[k2] ?? k2, p]))} chosen={NOTICE_TYPE_LABELS_ZH[d.noticeType.choice] ?? d.noticeType.choice} /></div>
                      <ConfidenceRing value={d.noticeType.confidence} />
                    </div>
                  </>
                )}
                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c4.urgency}</div>
                <div className="mt-1"><ScoreLine score={d.urgency} legend={URGENCY_LEGEND} probabilities={urgencyProbs} /></div>
                {d.alarmCategory && (
                  <div className="mt-3 text-ink-2">
                    {zh.c4.alarm}：<span className="text-ink">{ALARM_LABELS_ZH[d.alarmCategory.choice] ?? d.alarmCategory.choice}</span> <span className="num text-ink-3">{d.alarmCategory.confidence.toFixed(2)}</span>
                  </div>
                )}
              </section>
            ) : (
              <section className="hairline rounded-md bg-panel p-6 text-center text-xs text-ink-3">{zh.c4.pick}</section>
            )}

            <section className="hairline rounded-md bg-panel p-4 text-xs">
              <div className="text-[11px] uppercase tracking-wider text-bad">{zh.c4.notAsked}</div>
              <ul className="mt-1 space-y-1.5">
                {C4_NOT_ASKED.map((q) => (
                  <li key={q.question} className="rounded-sm border border-dashed border-bad/30 p-2">
                    <div className="font-mono text-ink line-through decoration-bad/60">{q.question}</div>
                    <div className="mt-0.5 text-ink-2">{q.why_zh}</div>
                  </li>
                ))}
              </ul>
            </section>

            <SavingsCard scenario="c4" jevTraces={jevTraces} />
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
