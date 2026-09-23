import { B4_THRESHOLDS, EXAMPLE_REQUESTS, INITIAL_HOME, ROOMS, applyCommand, describeCommand, type Command, type Dispatch, type ExampleRequest, type HomeState, type JevTrace, type Trace } from "@jev/shared";
import { useMemo, useState } from "react";
import { ConfidenceRing } from "../components/ConfidenceRing";
import { FloorPlan } from "../components/FloorPlan";
import { LatencyChip } from "../components/LatencyChip";
import { LearningCard } from "../components/LearningCard";
import { NoulMeter } from "../components/NoulMeter";
import { ProbBars } from "../components/ProbBars";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { zh } from "../i18n/zh";
import { ApiError, api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

type Decision = Exclude<Dispatch, { kind: "split" }> | { kind: "split"; parts: { text: string; decision: Dispatch }[]; trace: Dispatch["trace"] };
interface CommandResponse {
  request: string;
  decision: Decision;
  commands: Command[];
  reply?: string;
  clarification?: string;
  traces: Trace[];
  baseline: { functionCallingUsd: number };
}
interface LogEntry {
  id: number;
  request: string;
  kind: Decision["kind"];
  lines: string[];
  reply?: string;
  clarification?: string;
  jevMs: number;
  claudeMs: number;
  usd: number;
}

const GROUPS: ExampleRequest["group"][] = ["single", "compound", "confirm", "question", "chat"];
const KIND_TONE: Record<Decision["kind"], string> = {
  commands: "bg-ok/10 text-ok",
  confirm_lock: "bg-warn/15 text-warn",
  clarify: "bg-paper-2 text-ink-2",
  split: "bg-claude-soft text-claude",
  chat: "bg-claude-soft text-claude",
  state_question: "bg-claude-soft text-claude",
};

const LEARNING = {
  proves: [
    "一次请求、14 个 speculative 问题就是一次带概率的 function calling：每个参数都有自己的分布和置信度，代码按门限决定用不用。",
    "数字（21 度、30%、音量 4）由正则提取，Jev 只回答\"有没有数字\"——不让它数数或算术。",
    "高风险动作（门锁）用更高的门限（0.85）并要求确认；Claude 只在拆分复合指令和闲聊 / 状态问答时出场。",
  ],
  tryThis: [
    "先发 \"turn off all the lights\"，再发一条复合指令，看 Claude 拆分后每段各自再问 Jev（轨迹里标为文档允许的例外）。",
    "发 \"unlock the front door\"：即使置信度 0.99 也会要求确认；再发 \"lock the front door\" 看是否直接执行。",
    "发一条缺房间的指令（\"turn the TV off\"），看追问；再加上房间名重发。",
  ],
  pitfalls: [
    "Jev 只读字面：\"make it brighter\" 没有房间也没有明确设备，会被追问——这是对的，不要硬猜。",
    "复合指令的拆分质量取决于 Claude；拆错了每段仍会被 Jev 独立判断，但用户意图可能已经丢失。",
    "同一设备的两个参数（\"warm white and dim\"）可能被判为复合也可能不是；两种结果都合理，门限 0.7 是产品决策。",
  ],
};

function affectedRooms(cmds: Command[]): Set<string> {
  const s = new Set<string>();
  for (const c of cmds) {
    if (c.type === "lock") s.add("front_door_lock");
    else if (c.room === "all") ROOMS.forEach((r) => s.add(r));
    else s.add(c.room);
  }
  return s;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-3">{title}</div>
      {children}
    </div>
  );
}

export function B4SmartHome() {
  const { addTraces } = useSession();
  const [home, setHome] = useState<HomeState>(INITIAL_HOME);
  const [request, setRequest] = useState(EXAMPLE_REQUESTS[0]!.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CommandResponse | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<{ request: string; command: Command; confidence: number } | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Trace[]>([]);

  async function send(text: string, confirmed = false) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const res = await api.post<CommandResponse>("/api/b4/command", { request: t, home, confirmed });
      setLast(res);
      setHistory((h) => [...h, ...res.traces]);
      addTraces(res.traces);
      if (res.commands.length) {
        setHome((h) => res.commands.reduce(applyCommand, h));
        setChanged(affectedRooms(res.commands));
        window.setTimeout(() => setChanged(new Set()), 1800);
      }
      const jev = res.traces.filter((x): x is JevTrace => x.kind === "jev");
      setLog((l) => [
        {
          id: Date.now(),
          request: t,
          kind: res.decision.kind,
          lines: res.commands.map(describeCommand),
          reply: res.reply,
          clarification: res.clarification,
          jevMs: jev.length ? Math.max(...jev.map((x) => x.latencyMs)) : 0,
          claudeMs: res.traces.filter((x) => x.kind === "claude").reduce((s, x) => s + x.latencyMs, 0),
          usd: res.traces.reduce((s, x) => s + x.cost.usd, 0),
        },
        ...l,
      ]);
      if (res.decision.kind === "confirm_lock" && !confirmed) setPending({ request: t, command: res.decision.command, confidence: res.decision.confidence });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const jevHistory = useMemo(() => history.filter((x): x is JevTrace => x.kind === "jev"), [history]);
  const decision = last?.decision;
  const trace = decision?.trace;
  const lastJev = last?.traces.filter((x): x is JevTrace => x.kind === "jev") ?? [];
  const lastClaude = last?.traces.filter((x) => x.kind === "claude") ?? [];

  return (
    <div className="rise">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">{zh.b4.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">{zh.b4.intro}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <section className="hairline rounded-md bg-panel p-3">
            <div className="flex items-center justify-between px-1 pb-2 text-xs text-ink-3">
              <span>{zh.b4.floorPlan}</span>
              <button type="button" className="hover:text-ink" onClick={() => { setHome(INITIAL_HOME); setLog([]); setLast(null); setPending(null); }}>
                {zh.b4.reset}
              </button>
            </div>
            <FloorPlan home={home} changed={changed} />
          </section>

          <section className="hairline rounded-md bg-panel p-4">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(request);
              }}
            >
              <input className="hairline min-w-72 flex-1 rounded-sm bg-paper px-3 py-2 text-sm" value={request} onChange={(e) => setRequest(e.target.value)} placeholder={zh.b4.request} maxLength={300} />
              <button type="submit" disabled={busy || !request.trim()} className="rounded-md bg-jev px-4 py-2 text-sm text-white disabled:opacity-40">
                {busy ? zh.b4.sending : zh.b4.send}
              </button>
            </form>
            {error && <div className="mt-3 rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
            {pending && (
              <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
                <div className="font-medium text-warn">{zh.b4.confirmTitle}</div>
                <p className="mt-1 text-ink-2">
                  {describeCommand(pending.command)} · {zh.b4.confirmBody} <span className="num">{pending.confidence.toFixed(2)}</span>
                  {pending.command.type === "lock" && !pending.command.locked ? "（开锁永远需要确认）" : `（门限 ${B4_THRESHOLDS.lockMin}）`}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-md bg-warn px-3 py-1.5 text-xs text-white" onClick={() => void send(pending.request, true)}>
                    {zh.b4.confirm}
                  </button>
                  <button type="button" className="hairline rounded-md bg-paper px-3 py-1.5 text-xs text-ink-2" onClick={() => setPending(null)}>
                    {zh.b4.cancel}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              {GROUPS.map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[11px] text-ink-3">{zh.b4.groups[g]}</span>
                  {EXAMPLE_REQUESTS.filter((e) => e.group === g).map((e) => (
                    <button
                      key={e.text}
                      type="button"
                      title={e.note_zh}
                      disabled={busy}
                      onClick={() => {
                        setRequest(e.text);
                        void send(e.text);
                      }}
                      className={`hairline rounded-full px-2.5 py-1 text-xs hover:bg-jev-soft ${last?.request === e.text ? "bg-jev-soft text-jev" : "bg-paper text-ink-2"}`}
                    >
                      {e.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="hairline rounded-md bg-panel">
            <div className="border-b border-rule px-4 py-2 text-xs text-ink-3">{zh.b4.log}</div>
            {log.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-3">{zh.b4.empty}</div>
            ) : (
              <ol className="divide-y divide-rule text-xs">
                {log.map((e) => (
                  <li key={e.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">{e.request}</span>
                      <span className={`rounded-sm px-1.5 py-0.5 text-[11px] ${KIND_TONE[e.kind]}`}>{zh.b4.kinds[e.kind]}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {e.jevMs > 0 && <LatencyChip ms={e.jevMs} />}
                        {e.claudeMs > 0 && <LatencyChip ms={e.claudeMs} kind="claude" />}
                        <span className="num text-ink-3">{fmtUsd(e.usd)}</span>
                      </span>
                    </div>
                    {e.lines.length > 0 && <div className="mt-1 text-ink-2">{zh.b4.applied}：{e.lines.join("；")}</div>}
                    {e.clarification && <div className="mt-1 text-ink-2">{zh.b4.clarify}：{e.clarification}</div>}
                    {e.reply && <div className="mt-1 text-claude">{zh.b4.reply}：{e.reply}</div>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="hairline rounded-md bg-panel p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{zh.b4.trace}</div>
              {decision && <span className={`rounded-sm px-1.5 py-0.5 text-[11px] ${KIND_TONE[decision.kind]}`}>{zh.b4.kinds[decision.kind]}</span>}
            </div>
            {!trace ? (
              <p className="mt-3 text-xs text-ink-3">{zh.b4.empty}</p>
            ) : (
              <>
                <Section title={zh.b4.rule}>
                  <p className="text-xs text-ink">{trace.rule_zh}</p>
                </Section>
                {trace.category && (
                  <Section title={zh.b4.category}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={trace.category.probabilities} chosen={trace.category.choice} /></div>
                      <ConfidenceRing value={trace.category.confidence} />
                    </div>
                  </Section>
                )}
                <Section title={zh.b4.compound}>
                  <NoulMeter value={trace.compound} no={0.3} yes={B4_THRESHOLDS.compound} />
                </Section>
                {trace.room && (
                  <Section title={zh.b4.room}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={trace.room.probabilities} chosen={trace.room.choice} /></div>
                      <ConfidenceRing value={trace.room.confidence} />
                    </div>
                  </Section>
                )}
                {trace.device && (
                  <Section title={zh.b4.device}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={trace.device.probabilities} chosen={trace.device.choice} /></div>
                      <ConfidenceRing value={trace.device.confidence} />
                    </div>
                  </Section>
                )}
                {trace.action && (
                  <Section title={`${zh.b4.action} · ${trace.action.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1"><ProbBars probabilities={trace.action.read.probabilities} chosen={trace.action.read.choice} /></div>
                      <ConfidenceRing value={trace.action.read.confidence} />
                    </div>
                  </Section>
                )}
                <Section title={zh.b4.number}>
                  <span className="num text-xs text-ink">
                    {trace.number ? `${trace.number.value} (${trace.number.unit})` : zh.b4.noNumber} · mentions_number {trace.mentionsNumber.toFixed(2)}
                  </span>
                </Section>
                {decision?.kind === "split" && (
                  <Section title={zh.b4.parts}>
                    <ol className="space-y-1 text-xs">
                      {decision.parts.map((p) => (
                        <li key={p.text} className="flex items-center gap-2">
                          <span className={`rounded-sm px-1.5 py-0.5 text-[11px] ${KIND_TONE[p.decision.kind]}`}>{zh.b4.kinds[p.decision.kind]}</span>
                          <span className="text-ink">{p.text}</span>
                          <span className="ml-auto text-ink-3">{p.decision.trace.rule_zh}</span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}
                {trace.ignored.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-ink-3">
                      {zh.b4.ignored} · <span className="num">{trace.ignored.length}</span>
                    </summary>
                    <p className="num mt-1 text-xs text-ink-3">{trace.ignored.join(" · ")}</p>
                  </details>
                )}
              </>
            )}
          </section>

          {last && (
            <section className="hairline flex flex-wrap items-center gap-3 rounded-md bg-panel px-4 py-3 text-xs text-ink-2">
              <span>
                {zh.b4.costJev} <span className="num text-jev">{fmtUsd(lastJev.reduce((s, x) => s + x.cost.usd, 0))}</span>
                <span className="num text-ink-3"> · {lastJev.length} 次</span>
              </span>
              {lastJev[0] && <LatencyChip ms={Math.max(...lastJev.map((x) => x.latencyMs))} cached={lastJev.every((x) => x.cached)} />}
              <span>
                {zh.b4.costClaude} <span className="num text-claude">{lastClaude.length ? fmtUsd(lastClaude.reduce((s, x) => s + x.cost.usd, 0)) : "—"}</span>
              </span>
              <span className="ml-auto">
                {zh.b4.baseline} <span className="num text-ink">{fmtUsd(last.baseline.functionCallingUsd)}</span>
              </span>
            </section>
          )}

          <SavingsCard scenario="b4" jevTraces={jevHistory} />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <RequestInspector traces={history} />
        <LearningCard proves={LEARNING.proves} tryThis={LEARNING.tryThis} pitfalls={LEARNING.pitfalls} />
      </div>
    </div>
  );
}
