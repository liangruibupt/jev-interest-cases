import { C4_QUESTIONS, VPP_NOTICES, VPP_SITES, applyNotice, buildPairState, estimateLlmBaseline, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: 12 notices × 3 sites (cache off), routes compared with the hand labels. */
export async function c4(): Promise<void> {
  const pairs = VPP_NOTICES.flatMap((n) => VPP_SITES.map((s) => ({ n, s })));
  const outcomes = await Promise.all(pairs.map(({ n, s }) => askJev({ scenario: "c4", state: buildPairState(n, s), questions: C4_QUESTIONS }, { cache: "off" })));
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  const problems: string[] = [];
  let hits = 0;
  outcomes.forEach((o, i) => {
    const { n, s } = pairs[i]!;
    traces.push(o.trace);
    const d = applyNotice(o.result.answers as unknown as Answers, n, s);
    const expected = n.expected[s.id] ?? [];
    const ok = expected.includes(d.route);
    if (ok) hits += 1;
    rows.push({
      pair: `${n.id}:${s.id}`,
      expect: expected.join("|"),
      route: `${d.route}${ok ? "" : " ✘"}`,
      rule: d.ruleId,
      type: d.noticeType ? `${d.noticeType.choice} ${d.noticeType.confidence.toFixed(2)}` : "-",
      region: d.appliesRegion.toFixed(2),
      asset: d.appliesAsset.toFixed(2),
      names: d.namesSite.toFixed(2),
      one: d.addressedToOneSite.toFixed(2),
      action: d.requiresAction.toFixed(2),
      test: d.isTest.toFixed(2),
      urgency: d.urgency.toFixed(2),
      alarm: d.alarmCategory ? `${d.alarmCategory.choice} ${d.alarmCategory.confidence.toFixed(2)}` : "-",
      constraints: d.constraints.map((c) => `${c.kind}${c.satisfied === false ? "✗" : c.satisfied === true ? "✓" : ""}`).join(" "),
      ms: o.trace.latencyMs,
    });
    if (d.namesSite >= 0.5 && (d.noticeType?.choice === "alarm" || d.noticeType?.choice === "customer_request") && d.route === "not_applicable") problems.push(`${n.id}:${s.id}: named-site alarm / request marked not applicable`);
  });
  console.table(rows);
  const usd = traces.reduce((acc, t) => acc + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`route hits ${hits}/${pairs.length} · tokens ${traces.reduce((acc, t) => acc + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[Math.floor(sorted.length / 2)]}ms · max ${sorted[sorted.length - 1]}ms`);
  const est = estimateLlmBaseline("c4", traces, "standard");
  console.log(`applicability baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (hits < 32) problems.push(`only ${hits}/${pairs.length} routes match`);
  if (problems.length) throw new Error(`C4 smoke:\n${problems.join("\n")}`);
}
