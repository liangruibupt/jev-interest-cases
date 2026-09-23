import { B3_PRESET_QUERIES, B3_QUESTIONS, CORPUS, bm25Search, buildIndex, buildPassageState, estimateLlmBaseline, gatePassage, passageById, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: BM25 top-10 for each preset query, four Nouls per passage (cache off), gate, and the planted-passage assertions. */
export async function b3(): Promise<void> {
  const index = buildIndex(CORPUS);
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  const problems: string[] = [];
  for (const p of B3_PRESET_QUERIES) {
    const hits = bm25Search(index, p.query, 10);
    const outcomes = await Promise.all(
      hits.map((h) => askJev({ scenario: "b3", state: buildPassageState(p.query, passageById(h.id)!), questions: B3_QUESTIONS }, { cache: "off" })),
    );
    const gated = outcomes.map((o, i) => ({ id: hits[i]!.id, gate: gatePassage(o.result.answers as unknown as Answers) }));
    outcomes.forEach((o) => traces.push(o.trace));
    const counts = { accepted: 0, conflicting: 0, excluded: 0 };
    for (const g of gated) {
      if (g.gate.route === "accepted") counts.accepted += 1;
      else if (g.gate.route === "conflicting") counts.conflicting += 1;
      else counts.excluded += 1;
    }
    const forum = gated.find((g) => g.id === "forum-injection");
    const blogs = gated.filter((g) => g.id.startsWith("blog-"));
    const ms = outcomes.map((o) => o.trace.latencyMs);
    rows.push({
      query: p.query.slice(0, 58),
      accepted: counts.accepted,
      conflicting: counts.conflicting,
      excluded: counts.excluded,
      acceptedIds: gated.filter((g) => g.gate.route === "accepted").map((g) => g.id.replace("rfc-", "")).join(" "),
      forum: forum ? `${forum.gate.values.injection.toFixed(2)} ${forum.gate.route}` : "-",
      blogs: blogs.map((b) => `${b.id.replace("blog-", "")}:${b.gate.values.contradicts.toFixed(2)} ${b.gate.route}`).join(" | ") || "-",
      maxMs: Math.max(...ms),
    });
    if (forum && forum.gate.route !== "excluded_injection") problems.push(`${p.query}: forum injection not excluded (${forum.gate.values.injection.toFixed(2)})`);
    if (p.expectConflict && counts.conflicting === 0) problems.push(`${p.query}: false premise produced no conflicting passage`);
    if (p.expectNoAccepted && counts.accepted > 0) problems.push(`${p.query}: accepted ${counts.accepted} passages but the document has no evidence`);
    if (!p.falsePremise && counts.accepted === 0 && hits.length > 0) problems.push(`${p.query}: nothing accepted`);
  }
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`${traces.length} passage judgments · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[Math.floor(sorted.length / 2)]}ms · max ${sorted[sorted.length - 1]}ms`);
  const est = estimateLlmBaseline("b3", traces, "standard");
  console.log(`gate baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (problems.length) throw new Error(`B3 smoke:\n${problems.join("\n")}`);
}
