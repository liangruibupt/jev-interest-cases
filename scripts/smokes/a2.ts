import { A2_QUESTIONS, LANE_LABELS_ZH, TICKETS, buildTicketState, compose, estimateLlmBaseline, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Evaluates all 24 tickets (cache off), prints the routing table, asserts hand labels. */
export async function a2(): Promise<void> {
  const traces: JevTrace[] = [];
  const rows: Record<string, unknown>[] = [];
  let hits = 0;
  const misses: string[] = [];
  const outcomes = await Promise.all(
    TICKETS.map((t) => askJev({ scenario: "a2", state: buildTicketState(t), questions: A2_QUESTIONS }, { cache: "off" })),
  );
  outcomes.forEach((o, i) => {
    const t = TICKETS[i]!;
    const answers = o.result.answers as unknown as Answers;
    const d = compose(answers);
    const dept = answers.department;
    const deptStr = dept && dept.type === "choice" ? `${dept.choice} ${(dept.probabilities[dept.choice] ?? 0).toFixed(2)} / conf ${(dept.confidence ?? 0).toFixed(2)}` : "-";
    const ok = t.expected_lanes.includes(d.lane);
    if (ok) hits += 1;
    else misses.push(`${t.id} expected ${t.expected_lanes.join("|")} got ${d.lane}`);
    traces.push(o.trace);
    rows.push({ id: t.id, expected: t.expected_lanes.join("|"), lane: `${d.lane}${ok ? "" : " ✘"}`, dept: deptStr, spam: d.spamRisk.toFixed(2), prio: d.priority.toFixed(2), badges: d.badges.join(","), cc: d.ccTeams.join(","), ms: o.trace.latencyMs, tok: o.trace.response.usage.input_tokens });
  });
  console.table(rows);
  const totalUsd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const totalTok = traces.reduce((s, t) => s + t.response.usage.input_tokens, 0);
  const lat = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`hits ${hits}/24 · tokens ${totalTok} · cost $${totalUsd.toFixed(6)} · latency p50 ${lat[Math.floor(lat.length / 2)]}ms max ${lat.at(-1)}ms (24 concurrent, queue 6)`);
  const est = estimateLlmBaseline("a2", traces, "standard");
  console.log(`baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  console.log(`lanes: ${Object.entries(LANE_LABELS_ZH).map(([k, v]) => `${v} ${rows.filter((r) => String(r.lane).startsWith(k)).length}`).join(" · ")}`);
  const quarantined = rows.filter((r) => (r.id === "T21" || r.id === "T22") && String(r.lane).startsWith("quarantine")).length;
  if (misses.length) console.log("misses:\n  " + misses.join("\n  "));
  if (hits < 20) throw new Error(`A2 smoke: only ${hits}/24 tickets in expected lanes`);
  if (quarantined !== 2) throw new Error("A2 smoke: both phishing tickets must be quarantined");
}
