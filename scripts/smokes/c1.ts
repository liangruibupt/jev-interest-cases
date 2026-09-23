import { C1_QUESTIONS, ESSAYS, buildEssayState, estimateLlmBaseline, gradeFromAnswers, type Answers, type JevTrace } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

/** Jev-only: grades the 12 essays (cache off) and checks the hand labels. */
export async function c1(): Promise<void> {
  const outcomes = await Promise.all(ESSAYS.map((e) => askJev({ scenario: "c1", state: buildEssayState(e), questions: C1_QUESTIONS }, { cache: "off" })));
  const rows: Record<string, unknown>[] = [];
  const traces: JevTrace[] = [];
  const problems: string[] = [];
  let levelHits = 0;
  let teacher = 0;
  outcomes.forEach((o, i) => {
    const e = ESSAYS[i]!;
    traces.push(o.trace);
    const g = gradeFromAnswers(o.result.answers as unknown as Answers, e.text);
    const nearest = Math.min(...e.expected.levels.map((l) => Math.abs(l - g.level)));
    const ok = nearest <= 0.75;
    if (ok) levelHits += 1;
    if (g.needsTeacher) teacher += 1;
    rows.push({
      id: e.id,
      expect: e.expected.levels.join("|"),
      level: `${g.level.toFixed(2)}${ok ? "" : " ✘"}`,
      conf: g.levelConfidence?.toFixed(2),
      points: `${g.points}/${g.maxPoints}`,
      criteria: g.criteria.map((c) => `${c.value.toFixed(2)}`).join(" "),
      onTopic: g.onTopic.toFixed(2),
      misconception: g.misconception ? `${g.misconception.choice} ${g.misconception.confidence.toFixed(2)}` : "-",
      clarity: g.clarity?.toFixed(2),
      sentences: g.sentences,
      flags: g.flags.join(","),
      teacher: g.needsTeacher ? "yes" : "",
      ms: o.trace.latencyMs,
    });
    if (e.expected.misconception && !g.flags.includes(`misconception:${e.expected.misconception}`)) problems.push(`${e.id}: expected misconception ${e.expected.misconception}, flags=${g.flags.join(",") || "none"}`);
    if (e.expected.offTopic && !g.flags.includes("off_topic")) problems.push(`${e.id}: expected off_topic`);
    if (e.expected.lengthFlag && !g.flags.includes(e.expected.lengthFlag)) problems.push(`${e.id}: expected ${e.expected.lengthFlag}`);
    if (e.id === "E01" && g.points !== 4) problems.push(`E01: expected 4/4 criteria met, got ${g.points}`);
  });
  console.table(rows);
  const usd = traces.reduce((s, t) => s + t.cost.usd, 0);
  const sorted = traces.map((t) => t.latencyMs).sort((a, b) => a - b);
  console.log(`level hits ${levelHits}/12 · teacher review ${teacher}/12 · tokens ${traces.reduce((s, t) => s + t.response.usage.input_tokens, 0)} · cost $${usd.toFixed(6)} · p50 ${sorted[6]}ms · max ${sorted[11]}ms`);
  const est = estimateLlmBaseline("c1", traces, "standard");
  console.log(`grading baseline ${est.tierLabel}: $${est.llmUsd.toFixed(4)} vs Jev $${est.jevUsd.toFixed(6)} → ${est.savingsPct.toFixed(2)}% (${est.ratio?.toFixed(0)}×)`);
  if (teacher > 3) problems.push(`teacher review ${teacher}/12 > 3`);
  if (levelHits < 10) problems.push(`only ${levelHits}/12 levels within 0.75 of a label`);
  if (problems.length) throw new Error(`C1 smoke:\n${problems.join("\n")}`);
}
