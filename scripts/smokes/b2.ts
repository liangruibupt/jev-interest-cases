import { B2_QUESTIONS, CANNED_CITATIONS, RFC_SECTIONS, buildClaimState, estimateLlmBaseline, stringStage, verdictFromAnswers, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Verifies the 8 canned citations (string stage in code, Jev with cache off) and asserts the expected verdicts. */
export async function b2(): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  let hits = 0;
  let jevCalls = 0;
  for (const c of CANNED_CITATIONS) {
    const settled = stringStage(c, RFC_SECTIONS);
    if (settled) {
      const ok = settled.verdict === c.expected;
      if (ok) hits += 1;
      rows.push({ id: c.id, expected: c.expected, verdict: `${settled.verdict}${ok ? "" : " ✘"}`, via: "string", relation: "-", conf: "-", quoteSupports: "-", ms: 0 });
      continue;
    }
    const section = RFC_SECTIONS.find((s) => s.id === c.section_id)!;
    const { result, trace } = await askJev({ scenario: "b2", state: buildClaimState(c.claim, section, c.quote), questions: B2_QUESTIONS }, { cache: "off" });
    jevCalls += 1;
    traces.push(trace);
    const v = verdictFromAnswers(c, result.answers as unknown as Answers);
    const ok = v.verdict === c.expected;
    if (ok) hits += 1;
    const rel = v.relation!;
    rows.push({ id: c.id, expected: c.expected, verdict: `${v.verdict}${v.review ? "?" : ""}${ok ? "" : " ✘"}`, via: "jev", relation: Object.entries(rel.probabilities).map(([k, p]) => `${k}=${p.toFixed(2)}`).join(" "), conf: (rel.confidence ?? 0).toFixed(2), quoteSupports: v.quoteSupports?.toFixed(2), ms: trace.latencyMs });
  }
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  console.log(`hits ${hits}/8 · jev calls ${jevCalls} · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)}`);
  const est = estimateLlmBaseline("b2", traces, "standard");
  console.log(`verification baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (jevCalls !== 6) throw new Error(`B2 smoke: expected 6 Jev calls, got ${jevCalls}`);
  if (hits < 7) throw new Error(`B2 smoke: only ${hits}/8 verdicts match`);
}
