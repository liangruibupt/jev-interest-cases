import { C2_QUESTIONS, PATIENT_MESSAGES, buildPatientState, estimateLlmBaseline, triage, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: triages the 16 messages (cache off) and checks the hand-labelled lanes and the hard rules. */
export async function c2(): Promise<void> {
  const outcomes = await Promise.all(PATIENT_MESSAGES.map((m) => askJev({ scenario: "c2", state: buildPatientState(m), questions: C2_QUESTIONS }, { cache: "off" })));
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  const problems: string[] = [];
  let hits = 0;
  outcomes.forEach((o, i) => {
    const m = PATIENT_MESSAGES[i]!;
    traces.push(o.trace);
    const d = triage(o.result.answers as unknown as Answers, m.text);
    const ok = m.expected_lanes.includes(d.lane);
    if (ok) hits += 1;
    rows.push({
      id: m.id,
      expect: m.expected_lanes.join("|"),
      lane: `${d.lane}${ok ? "" : " ✘"}`,
      rule: d.ruleId,
      urgency: d.urgency.toFixed(2),
      dept: d.department ? `${d.department.choice} ${d.department.confidence.toFixed(2)}` : "-",
      chest: d.redFlags[0]!.value.toFixed(2),
      breath: d.redFlags[1]!.value.toFixed(2),
      selfHarm: d.redFlags[2]!.value.toFixed(2),
      stroke: d.redFlags[3]!.value.toFixed(2),
      vitals: d.vitals.map((v) => `${v.kind}:${v.value}`).join(" ") || "-",
      advice: d.requestsAdvice.toFixed(2),
      child: d.aboutChild.toFixed(2),
      human: d.wantsHuman.toFixed(2),
      distress: d.distress.toFixed(2),
      ms: o.trace.latencyMs,
    });
    if (m.expected_lanes[0] === "emergency" && d.lane !== "emergency") problems.push(`${m.id}: emergency-labelled message landed in ${d.lane}`);
    if (!m.expected_lanes.includes("emergency") && d.lane === "emergency") problems.push(`${m.id}: routine message escalated to emergency (${d.reasons.join("; ")})`);
  });
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`lane hits ${hits}/16 · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[8]}ms · max ${sorted[15]}ms`);
  const est = estimateLlmBaseline("c2", traces, "standard");
  console.log(`triage baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (problems.length) throw new Error(`C2 smoke:\n${problems.join("\n")}`);
  if (hits < 14) throw new Error(`C2 smoke: only ${hits}/16 lanes match`);
}
