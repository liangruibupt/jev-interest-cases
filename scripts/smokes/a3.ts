import { A3_PRESET_QUERIES, buildDocumentState, buildFindQuestions, composeFind, estimateLlmBaseline, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Runs the six preset queries over the 218-line document (cache off) and checks the cookbook expectations. */
export async function a3(): Promise<void> {
  const state = buildDocumentState();
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  let statusHits = 0;
  let statusChecked = 0;
  const outcomes: Record<string, ReturnType<typeof composeFind>> = {};
  for (const p of A3_PRESET_QUERIES) {
    const { result, trace } = await askJev({ scenario: "a3", state, questions: buildFindQuestions(p.query) }, { cache: "off" });
    traces.push(trace);
    const r = composeFind(result.answers as unknown as Answers);
    outcomes[p.query] = r;
    const top = r.ranked[0];
    let ok = "";
    if (p.expect.length < 3) {
      statusChecked += 1;
      if (p.expect.includes(r.status)) statusHits += 1;
      else ok = " ✘";
    }
    rows.push({
      query: p.query,
      expect: p.expect.join("|"),
      status: `${r.status}${ok}`,
      exists: r.exists.toFixed(2),
      spans: r.spansMultiple.toFixed(2),
      top: top ? `${top.lineId} ${top.prob.toFixed(2)}` : "-",
      topText: top ? top.text.slice(0, 60) : "-",
      ms: trace.latencyMs,
      tokens: trace.response.usage.input_tokens,
    });
  }
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  console.log(`status hits ${statusHits}/${statusChecked} · ${traces.length} requests · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${[...traces.map((t) => t.latencyMs)].sort((a, b) => a - b)[Math.floor(traces.length / 2)]}ms`);
  const est = estimateLlmBaseline("a3", traces, "standard");
  console.log(`baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);

  const ownership = outcomes[A3_PRESET_QUERIES[0]!.query]!;
  if (!/own/i.test(ownership.ranked[0]?.text ?? "")) throw new Error(`A3 smoke: ownership top line does not mention ownership: ${ownership.ranked[0]?.lineId}`);
  const arbitration = outcomes[A3_PRESET_QUERIES[2]!.query]!;
  if (arbitration.exists >= 0.5) throw new Error(`A3 smoke: arbitration exists=${arbitration.exists.toFixed(2)}, expected the document not to answer it`);
  if (statusHits < statusChecked - 1) throw new Error(`A3 smoke: only ${statusHits}/${statusChecked} statuses match`);
}
