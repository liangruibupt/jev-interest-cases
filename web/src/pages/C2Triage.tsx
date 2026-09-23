import { C2_NOT_ASKED, C2_THRESHOLDS, LANE_PRIORITY, PATIENT_MESSAGES, TRIAGE_LANE_LABELS_ZH, VITAL_LABELS_ZH, triage, type Answers, type C2Thresholds, type JevTrace, type RedFlagId, type Trace, type TriageDecision, type TriageLane } from "@jev/shared";
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

interface TriageResponse {
  results: Record<string, { answers: Answers; traceId: string }>;
  errors: Record<string, string>;
  traces: JevTrace[];
}

const LANE_TONE: Record<TriageLane, string> = {
  emergency: "bg-bad/10 text-bad border-bad/30",
  nurse_same_day: "bg-warn/15 text-warn border-warn/30",
  human_review: "bg-claude-soft text-claude border-claude/30",
  behavioral_health: "bg-jev-soft text-jev border-jev/30",
  physician: "bg-jev-soft text-jev border-jev/30",
  pharmacy: "bg-ok/10 text-ok border-ok/30",
  scheduling: "bg-ok/10 text-ok border-ok/30",
  billing: "bg-ok/10 text-ok border-ok/30",
};
const RED_FLAG_ZH: Record<RedFlagId, string> = { red_flag_chest_pain: "胸痛", red_flag_breathing: "呼吸困难 / 口唇发紫", red_flag_self_harm: "自伤念头", red_flag_stroke_or_bleeding: "卒中征象 / 大出血" };
const URGENCY_LEGEND: Record<string, string> = { "0": "行政 / 预约，无症状", "1": "可等几天的临床问题", "2": "需当天临床关注", "3": "可能的急症" };
const LANES = (Object.keys(LANE_PRIORITY) as TriageLane[]).sort((a, b) => LANE_PRIORITY[a] - LANE_PRIORITY[b]);

const LEARNING = {
  proves: [
    "分诊是文字判断：紧急度、科室、红旗、是否索要建议，一次请求 11 题，每条留言约 1,000 tokens、$0.00004。",
    "硬规则先于模型：任一红旗 ≥ 0.7 直接急诊；体温、血糖、血压、血氧由代码解析并比较阈值，Jev 只回答\"有没有提到测量值\"。",
    "边界清楚：没有问\"是什么病\"\"该吃多少\"——右下方列出了刻意不问的问题。",
  ],
  tryThis: [
    "把\"红旗 ≥\"从 0.7 拉到 0.9：三条急诊留言的红旗都在 0.96–0.99，仍是急诊；说明信号很干净。",
    "看 P05：Jev 的 urgency 约 2.2，是代码从 \"103.5 F\" 算出高热才把它送到护士当天。",
    "看 P08：科室 nursing 只有约 0.5（与 physician 分票），但 urgency ≈ 2 —— 拿不准时交临床人员，不交行政人工。",
  ],
  pitfalls: [
    "这是演示数据；真实系统必须先用本院标注集量准确率，并保留人工兜底，Jev 不是医疗器械。",
    "数值阈值表是产品决策（本例 39 °C、300 mg/dL、180/120、92%）；不在表里的数值（LDL 160）只按文字判断。",
    "把患者信息送第三方 API 需要合规协议；本例全部为合成留言。",
  ],
};

function urgencyProbs(answers: Answers | undefined): Record<string, number> {
  const u = answers?.urgency;
  return u && u.type === "score" ? u.probabilities : {};
}

function MiniNoul({ label, value, act, review }: { label: string; value: number; act: number; review: number }) {
  const tone = value >= act ? "text-bad" : value >= review ? "text-warn" : "text-ink-2";
  return (
    <div className="flex items-center gap-2 text-[11px]" title={`${label} = ${value.toFixed(3)}`}>
      <span className="w-28 shrink-0 text-ink-3">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-[3px] bg-paper-2">
        <div className={`absolute inset-y-0 left-0 rounded-[3px] ${value >= act ? "bg-bad" : value >= review ? "bg-warn" : "bg-jev"}`} style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${review * 100}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-px bg-ink-3" style={{ left: `${act * 100}%` }} />
      </div>
      <span className={`num w-8 text-right ${tone}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export function C2Triage() {
  const { addTraces } = useSession();
  const [results, setResults] = useState<TriageResponse["results"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState<C2Thresholds>({ ...C2_THRESHOLDS });

  const decisions = useMemo(() => {
    if (!results) return {};
    const out: Record<string, TriageDecision> = {};
    for (const m of PATIENT_MESSAGES) {
      const r = results[m.id];
      if (r) out[m.id] = triage(r.answers, m.text, t);
    }
    return out;
  }, [results, t]);
  const jevTraces = useMemo(() => history.filter((x): x is JevTrace => x.kind === "jev"), [history]);
  const laneCounts = useMemo(() => {
    const c: Partial<Record<TriageLane, number>> = {};
    for (const d of Object.values(decisions)) c[d.lane] = (c[d.lane] ?? 0) + 1;
    return c;
  }, [decisions]);

  async function triageAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<TriageResponse>("/api/c2/triage", { live });
      setResults(res.results);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
      if (Object.keys(res.errors).length) setError(Object.entries(res.errors).map(([id, e]) => `${id}: ${e}`).join("；"));
      if (!selected) setSelected("P01");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const sel = selected ? PATIENT_MESSAGES.find((m) => m.id === selected) : undefined;
  const selD = selected ? decisions[selected] : undefined;

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.c2.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.c2.intro}</p>
      </header>

      <section className="hairline mb-4 flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3">
        <button type="button" disabled={busy} onClick={() => void triageAll()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
          {busy ? zh.c2.triaging : zh.c2.triageAll}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {zh.c2.live}
        </label>
        <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.thresholds}</span>
        <div className="flex flex-wrap gap-4">
          <ThresholdSlider label={zh.c2.act} value={t.act} min={0.5} max={0.95} step={0.05} onChange={(v) => setT((p) => ({ ...p, act: v }))} />
          <ThresholdSlider label={zh.c2.sameDay} value={t.urgencySameDay} min={1.5} max={3} step={0.1} onChange={(v) => setT((p) => ({ ...p, urgencySameDay: v }))} />
          <ThresholdSlider label={zh.c2.deptMin} value={t.departmentMin} min={0.3} max={0.9} step={0.05} onChange={(v) => setT((p) => ({ ...p, departmentMin: v }))} />
        </div>
        {error && <div className="w-full rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      </section>

      {!results && !busy && <div className="rounded-md border border-dashed border-rule bg-panel/60 p-10 text-center text-sm text-ink-3">{zh.c2.empty}</div>}

      {results && (
        <div className="grid gap-5 lg:grid-cols-5">
          <section className="space-y-3 lg:col-span-3">
            {LANES.filter((lane) => (laneCounts[lane] ?? 0) > 0).map((lane) => (
              <div key={lane} className="hairline rounded-md bg-panel">
                <div className={`flex items-center justify-between rounded-t-md border-b px-4 py-2 text-xs ${LANE_TONE[lane]}`}>
                  <span className="font-medium">{TRIAGE_LANE_LABELS_ZH[lane]}</span>
                  <span className="num">{laneCounts[lane]}</span>
                </div>
                <ul className="divide-y divide-rule/60">
                  {PATIENT_MESSAGES.filter((m) => decisions[m.id]?.lane === lane).map((m) => {
                    const d = decisions[m.id]!;
                    const isSel = selected === m.id;
                    return (
                      <li key={m.id}>
                        <button type="button" onClick={() => setSelected(m.id)} className={`w-full px-4 py-2 text-left text-xs ${isSel ? "bg-jev-soft/60" : "hover:bg-paper-2/60"}`}>
                          <div className="flex items-center gap-2">
                            <span className="num text-ink-3">{m.id}</span>
                            <span className="rounded-sm bg-paper-2 px-1 text-[10px] text-ink-3">{zh.c2.channel[m.channel]}</span>
                            <span className="num text-ink-2">
                              urgency {d.urgency.toFixed(1)}
                            </span>
                            {d.department && (
                              <span className="num text-ink-3">
                                {d.department.choice} {d.department.confidence.toFixed(2)}
                              </span>
                            )}
                            <span className="ml-auto flex gap-1">
                              {d.redFlags.filter((f) => f.value >= t.review).map((f) => (
                                <span key={f.id} className={`rounded-sm px-1 text-[10px] ${f.value >= t.act ? "bg-bad/10 text-bad" : "bg-warn/15 text-warn"}`}>
                                  {RED_FLAG_ZH[f.id]} <span className="num">{f.value.toFixed(2)}</span>
                                </span>
                              ))}
                              {d.vitals.map((v) => (
                                <span key={v.kind} className={`rounded-sm px-1 text-[10px] ${v.severity === "emergency" ? "bg-bad/10 text-bad" : "bg-warn/15 text-warn"}`}>
                                  {VITAL_LABELS_ZH[v.kind]} <span className="num">{v.value}</span>
                                </span>
                              ))}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-ink">{m.text}</p>
                          <p className="mt-0.5 text-[11px] text-ink-3">{d.rule_zh}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <div className="space-y-4 lg:col-span-2">
            {sel && selD ? (
              <section className="hairline rounded-md bg-panel p-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3">
                    {zh.c2.message} · {sel.id}
                  </div>
                  <span className={`rounded-sm border px-1.5 py-0.5 ${LANE_TONE[selD.lane]}`}>{TRIAGE_LANE_LABELS_ZH[selD.lane]}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{sel.text}</p>
                <p className="mt-1 text-[11px] text-ink-3">
                  {zh.c2.expected}：{sel.expected_lanes.map((l) => TRIAGE_LANE_LABELS_ZH[l]).join(" / ")} · {sel.note_zh}
                </p>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.rule}</div>
                <p className="mt-1 text-ink">{selD.rule_zh}</p>
                {selD.reasons.length > 0 && <p className="num mt-0.5 text-ink-3">{selD.reasons.join(" · ")}</p>}

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.urgency}</div>
                <div className="mt-1">
                  <ScoreLine score={selD.urgency} legend={URGENCY_LEGEND} probabilities={urgencyProbs(results[sel.id]?.answers)} />
                </div>

                {selD.department && (
                  <>
                    <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.department}</div>
                    <div className="mt-1 flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={selD.department.probabilities} chosen={selD.department.choice} /></div>
                      <ConfidenceRing value={selD.department.confidence} />
                    </div>
                  </>
                )}

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.redFlags}</div>
                <div className="mt-1 space-y-1">
                  {selD.redFlags.map((f) => (
                    <MiniNoul key={f.id} label={RED_FLAG_ZH[f.id]} value={f.value} act={t.act} review={t.review} />
                  ))}
                </div>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.vitals}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selD.vitals.length === 0 && <span className="text-ink-3">{zh.c2.noVitals}</span>}
                  {selD.vitals.map((v) => (
                    <span key={v.kind} className={`rounded-sm px-1.5 py-0.5 ${v.severity === "emergency" ? "bg-bad/10 text-bad" : "bg-warn/15 text-warn"}`}>
                      {VITAL_LABELS_ZH[v.kind]} <span className="num">{v.value}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.signals}</div>
                <div className="num mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-ink-2">
                  <span>{zh.c2.advice} <span className="text-ink">{selD.requestsAdvice.toFixed(2)}</span></span>
                  <span>{zh.c2.child} <span className="text-ink">{selD.aboutChild.toFixed(2)}</span></span>
                  <span>{zh.c2.human} <span className="text-ink">{selD.wantsHuman.toFixed(2)}</span></span>
                  <span>{zh.c2.distress} <span className="text-ink">{selD.distress.toFixed(2)} / 2</span></span>
                  <span>mentions_measurement <span className="text-ink">{selD.mentionsMeasurement.toFixed(2)}</span></span>
                </div>
              </section>
            ) : (
              <section className="hairline rounded-md bg-panel p-6 text-center text-xs text-ink-3">{zh.c2.pick}</section>
            )}

            <section className="hairline rounded-md bg-panel p-4 text-xs">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.c2.hardRules}</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-2">
                {zh.c2.hardRuleList.map((r) => (
                  <li key={r}>{r.replace("{act}", t.act.toFixed(2)).replace("{review}", t.review.toFixed(2)).replace("{urgencyEmergency}", t.urgencyEmergency.toFixed(2))}</li>
                ))}
              </ol>
              <div className="mt-4 text-[11px] uppercase tracking-wider text-bad">{zh.c2.notAsked}</div>
              <ul className="mt-1 space-y-1.5">
                {C2_NOT_ASKED.map((q) => (
                  <li key={q.question} className="rounded-sm border border-dashed border-bad/30 p-2">
                    <div className="font-mono text-ink line-through decoration-bad/60">{q.question}</div>
                    <div className="mt-0.5 text-ink-2">{q.why_zh}</div>
                  </li>
                ))}
              </ul>
            </section>

            <SavingsCard scenario="c2" jevTraces={jevTraces} />
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
