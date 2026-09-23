import { EXAMPLE_REQUESTS, INITIAL_HOME, ROOMS, buildB4Questions, buildRequestState, dispatch, estimateLlmBaseline, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: the 20 example requests through the 14 questions (cache off) and the dispatcher. */
export async function b4(): Promise<void> {
  const questions = buildB4Questions(ROOMS);
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  let hits = 0;
  const problems: string[] = [];
  const outcomes = await Promise.all(EXAMPLE_REQUESTS.map((e) => askJev({ scenario: "b4", state: buildRequestState(e.text, INITIAL_HOME), questions }, { cache: "off" })));
  outcomes.forEach((o, i) => {
    const e = EXAMPLE_REQUESTS[i]!;
    traces.push(o.trace);
    const answers = o.result.answers as unknown as Answers;
    const d = dispatch(answers, e.text);
    const ok = e.expect.includes(d.kind);
    if (ok) hits += 1;
    const t = d.trace;
    rows.push({
      request: e.text.slice(0, 52),
      expect: e.expect.join("|"),
      kind: `${d.kind}${ok ? "" : " ✘"}`,
      category: t.category ? `${t.category.choice} ${t.category.confidence.toFixed(2)}` : "-",
      compound: t.compound.toFixed(2),
      room: t.room ? `${t.room.choice} ${t.room.confidence.toFixed(2)}` : "-",
      device: t.device ? `${t.device.choice} ${t.device.confidence.toFixed(2)}` : "-",
      action: t.action ? `${t.action.read.choice} ${t.action.read.confidence.toFixed(2)}` : "-",
      number: t.number ? `${t.number.value}${t.number.unit === "percent" ? "%" : t.number.unit === "celsius" ? "°C" : ""}` : "-",
      detail: d.kind === "commands" ? JSON.stringify(d.commands) : d.kind === "clarify" ? d.question_zh : d.kind === "confirm_lock" ? `conf ${d.confidence.toFixed(2)}` : "",
      ms: o.trace.latencyMs,
    });
    if (e.text.startsWith("unlock") && d.kind === "commands") problems.push(`${e.text}: unlock executed without confirmation`);
  });
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`hits ${hits}/${EXAMPLE_REQUESTS.length} · ${traces.length} requests · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[Math.floor(sorted.length / 2)]}ms · max ${sorted[sorted.length - 1]}ms`);
  const est = estimateLlmBaseline("b4", traces, "standard");
  console.log(`function-calling baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (problems.length) throw new Error(`B4 smoke:\n${problems.join("\n")}`);
  if (hits < 16) throw new Error(`B4 smoke: only ${hits}/${EXAMPLE_REQUESTS.length} dispatch kinds match`);
}
