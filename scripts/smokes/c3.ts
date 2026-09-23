import { C3_QUESTIONS, FILINGS, buildFilingState, estimateLlmBaseline, judgeFiling, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: judges the 15 announcements (cache off) and checks the hand-labelled reading lanes. */
export async function c3(): Promise<void> {
  const outcomes = await Promise.all(FILINGS.map((f) => askJev({ scenario: "c3", state: buildFilingState(f), questions: C3_QUESTIONS }, { cache: "off" })));
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  const problems: string[] = [];
  let hits = 0;
  let eventHits = 0;
  outcomes.forEach((o, i) => {
    const f = FILINGS[i]!;
    traces.push(o.trace);
    const j = judgeFiling(o.result.answers as unknown as Answers, f.text);
    const ok = f.expected.lanes.includes(j.lane);
    if (ok) hits += 1;
    if (f.expected.event && j.event?.choice === f.expected.event) eventHits += 1;
    rows.push({
      id: f.id,
      expect: f.expected.lanes.join("|"),
      lane: `${j.lane}${ok ? "" : " ✘"}`,
      rule: j.ruleId,
      materiality: `${j.materiality.toFixed(2)} (${(j.materialityConfidence ?? 0).toFixed(2)})`,
      event: j.event ? `${j.event.choice} ${j.event.confidence.toFixed(2)}${f.expected.event && j.event.choice !== f.expected.event ? " ✘" : ""}` : "-",
      direction: j.direction ? `${j.direction.choice} ${j.direction.confidence.toFixed(2)}` : "-",
      fwd: j.signals.forwardLooking.toFixed(2),
      hedged: j.signals.hedged.toFixed(2),
      acct: j.signals.accounting.toFixed(2),
      key: j.signals.keyPerson.toFixed(2),
      boiler: j.signals.boilerplate.toFixed(2),
      amounts: j.amounts.map((a) => a.text).join(" "),
      ms: o.trace.latencyMs,
    });
    if ((f.id === "F03" || f.id === "F04") && j.lane !== "read_now") problems.push(`${f.id}: restatement / going concern must be read_now, got ${j.lane}`);
    if (f.expected.lanes[0] === "archive" && j.lane === "read_now") problems.push(`${f.id}: routine item escalated to read_now`);
  });
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`lane hits ${hits}/15 · event hits ${eventHits}/${FILINGS.filter((f) => f.expected.event).length} · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[7]}ms · max ${sorted[14]}ms`);
  const est = estimateLlmBaseline("c3", traces, "standard");
  console.log(`judgment baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (hits < 13) problems.push(`only ${hits}/15 lanes match`);
  if (problems.length) throw new Error(`C3 smoke:\n${problems.join("\n")}`);
}
