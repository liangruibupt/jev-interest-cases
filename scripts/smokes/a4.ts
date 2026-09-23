import { A4_CASES, computeArmMetrics, type Answers, type RunRecord } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Cheap consistency check: Jev only, the moderation case, three uncached runs. */
export async function a4(): Promise<void> {
  const c = A4_CASES.find((x) => x.id === "moderation")!;
  const records: RunRecord[] = [];
  for (let run = 1; run <= 3; run++) {
    const { result, trace } = await askJev({ scenario: "a4", state: c.state, questions: c.questions }, { cache: "off" });
    records.push({ arm: "jev", run, answers: result.answers as unknown as Answers, latencyMs: trace.latencyMs, costUsd: trace.cost.usd, inputTokens: trace.response.usage.input_tokens, outputTokens: trace.response.usage.output_tokens, traceId: trace.id });
  }
  const m = computeArmMetrics("jev", records, c.questions);
  console.table(m.questions.map((q) => ({ question: q.questionId, labels: q.labelsPerRun.join(" / "), topP: q.topProbPerRun.map((p) => p.toFixed(2)).join(" / "), raw: q.rawAgreement.toFixed(2), std: q.meanStd.toFixed(4) })));
  console.log(`p50 ${m.p50LatencyMs}ms · per call $${m.usdPerCall.toFixed(6)} · raw agreement ${(m.meanRawAgreement * 100).toFixed(0)}% · policy ${(m.meanPolicyAgreement * 100).toFixed(0)}% · uncertain ${(m.meanUncertainShare * 100).toFixed(0)}%`);
  const stable = m.questions.filter((q) => q.rawAgreement >= 0.75).length;
  if (stable < 6) throw new Error(`A4 smoke: only ${stable}/8 questions stable across 3 runs`);
}
