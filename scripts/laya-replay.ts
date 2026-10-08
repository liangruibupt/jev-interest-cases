/**
 * `npx tsx scripts/laya-replay.ts [scenario...]` — replays cached Jev requests against a Jev-compatible
 * Laya server (`laya-serve`) and compares the answers. Default scenario: b4.
 *
 * Talks to Laya with plain fetch and never goes through `askJev`, so Laya answers can never
 * land in `server/.cache/jev/` (the cache key does not include the base URL).
 *
 * Env: LAYA_URL (default http://127.0.0.1:8000), LAYA_API_KEY (optional bearer), LAYA_CONCURRENCY (default 2).
 *   LAYA_STATE=text — send only the `request` field as a plain-string state and rewrite "`request`" in
 *     instructions to "this request". Laya ignores object states (2026-10-08: near-constant answers).
 *   LAYA_NOUL=choice — ask each Noul as a two-option Choice (yes / no, from its true / false criteria) and map
 *     P(yes) back to `noul`: the workaround the Laya author gives for Noul following its labels (#156).
 *   LAYA_GATE=answer — copy Laya's `answer_confidence` into `confidence` before dispatch; Laya's own
 *     `confidence` is not Jev's (0.0015 next to a 0.27 top probability).
 * Writes docs/results/laya-vs-jev-<scenarios>-<timestamp>.json.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EXAMPLE_REQUESTS, dispatch, type AnyAnswer, type Answers, type JevTrace } from "../shared/src/index";

const LAYA_URL = (process.env.LAYA_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.LAYA_CONCURRENCY ?? 2);
const STATE_MODE = process.env.LAYA_STATE === "text" ? "text" : "as-is";
const NOUL_MODE = process.env.LAYA_NOUL === "choice" ? "choice" : "noul";
const GATE = process.env.LAYA_GATE === "answer" ? "answer_confidence" : "confidence";
const CACHE_DIR = fileURLToPath(new URL("../server/.cache/jev/", import.meta.url));
const RESULTS_DIR = fileURLToPath(new URL("../docs/results/", import.meta.url));

interface LayaReply {
  answers: Answers;
  latencyMs: number;
  routing?: unknown;
  /** laya-serve reports whether the state or any question was cut to fit the checkpoint's budget. */
  usage?: { input_tokens?: number; state_tokens_dropped?: number; truncated?: boolean; truncated_questions?: string[] };
}

interface Question { type: string; instructions?: string; criteria?: Record<string, string | null> }

function layaBody(trace: JevTrace): { state: unknown; questions: unknown } {
  const state = trace.request.state as { request?: unknown };
  const asText = STATE_MODE === "text" && typeof state?.request === "string";
  const questions = Object.fromEntries(Object.entries(trace.request.questions as Record<string, Question>).map(([id, q]) => {
    const instructions = asText ? q.instructions?.replace(/`request`/g, "this request") : q.instructions;
    if (NOUL_MODE === "choice" && q.type === "noul") {
      return [id, { type: "choice", instructions, criteria: { yes: q.criteria?.true ?? "Yes", no: q.criteria?.false ?? "No" } }];
    }
    return [id, { ...q, instructions }];
  }));
  return { state: asText ? state.request : trace.request.state, questions };
}

/** Undo the LAYA_NOUL=choice rewrite so answers compare and dispatch as Noul again. */
function asNoul(trace: JevTrace, answers: Answers): Answers {
  if (NOUL_MODE === "noul") return answers;
  const questions = trace.request.questions as Record<string, Question>;
  return Object.fromEntries(Object.entries(answers).map(([id, a]) => [
    id,
    questions[id]?.type === "noul" && a.type === "choice" ? { type: "noul", noul: a.probabilities.yes ?? 0 } : a,
  ])) as Answers;
}

async function askLaya(trace: JevTrace): Promise<LayaReply> {
  const t0 = performance.now();
  const res = await fetch(`${LAYA_URL}/v1/systemone`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.LAYA_API_KEY ? { authorization: `Bearer ${process.env.LAYA_API_KEY}` } : {}) },
    body: JSON.stringify(layaBody(trace)),
  });
  const latencyMs = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`laya ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { answers: Answers; routing?: unknown; usage?: LayaReply["usage"] };
  const answers = GATE === "confidence" ? asNoul(trace, body.answers) : Object.fromEntries(Object.entries(asNoul(trace, body.answers)).map(([id, a]) => [
    id,
    a.type === "choice" ? { ...a, confidence: (a as { answer_confidence?: number }).answer_confidence ?? a.confidence } : a,
  ])) as Answers;
  return { answers, latencyMs, routing: body.routing, usage: body.usage };
}

/** One question compared: choice → same label; noul → same side of 0.5; score → |Δ| ≤ 0.5. */
interface QuestionDiff {
  id: string;
  type: AnyAnswer["type"];
  agree: boolean;
  jev: string;
  laya: string;
  delta: number;
}

function compare(id: string, jev: AnyAnswer, laya: AnyAnswer | undefined): QuestionDiff {
  if (!laya || laya.type !== jev.type) return { id, type: jev.type, agree: false, jev: show(jev), laya: laya ? show(laya) : "missing", delta: 1 };
  if (jev.type === "choice" && laya.type === "choice") {
    return { id, type: "choice", agree: jev.choice === laya.choice, jev: show(jev), laya: show(laya), delta: Math.abs((jev.probabilities[jev.choice] ?? 0) - (laya.probabilities[jev.choice] ?? 0)) };
  }
  if (jev.type === "noul" && laya.type === "noul") {
    return { id, type: "noul", agree: jev.noul >= 0.5 === laya.noul >= 0.5, jev: show(jev), laya: show(laya), delta: Math.abs(jev.noul - laya.noul) };
  }
  if (jev.type === "score" && laya.type === "score") {
    const delta = Math.abs(jev.score - laya.score);
    return { id, type: "score", agree: delta <= 0.5, jev: show(jev), laya: show(laya), delta };
  }
  return { id, type: jev.type, agree: false, jev: show(jev), laya: show(laya), delta: 1 };
}

function show(a: AnyAnswer): string {
  if (a.type === "choice") return `${a.choice} ${(a.confidence ?? 0).toFixed(2)}`;
  if (a.type === "noul") return a.noul.toFixed(2);
  return a.score.toFixed(2);
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

async function loadTraces(scenarios: string[]): Promise<JevTrace[]> {
  const files = (await readdir(CACHE_DIR)).filter((f) => f.endsWith(".json")).sort();
  const traces = await Promise.all(files.map(async (f) => JSON.parse(await readFile(CACHE_DIR + f, "utf8")) as JevTrace));
  return traces.filter((t) => scenarios.includes(t.scenario));
}

const scenarios = process.argv.slice(2).length ? process.argv.slice(2) : ["b4"];
const traces = await loadTraces(scenarios);
if (!traces.length) throw new Error(`no cached Jev traces for ${scenarios.join(", ")}`);
console.log(`[laya-replay] ${traces.length} cached Jev requests (${scenarios.join(", ")}) → ${LAYA_URL}/v1/systemone, concurrency ${CONCURRENCY}, state ${STATE_MODE}, noul ${NOUL_MODE}, gate ${GATE}`);

// The first call loads the checkpoint; keep it out of the latency numbers.
await askLaya(traces[0]!);

const runs = await pool(traces, CONCURRENCY, async (trace) => {
  const laya = await askLaya(trace);
  const diffs = Object.entries(trace.response.answers).map(([id, a]) => compare(id, a, laya.answers[id]));
  return { trace, laya, diffs };
});

const report: Record<string, unknown> = { date: new Date().toISOString(), layaUrl: LAYA_URL, stateMode: STATE_MODE, noulMode: NOUL_MODE, gate: GATE, scenarios: {} };
for (const scenario of scenarios) {
  const rs = runs.filter((r) => r.trace.scenario === scenario);
  if (!rs.length) continue;
  const all = rs.flatMap((r) => r.diffs);
  const byType = (["choice", "noul", "score"] as const).map((type) => {
    const ds = all.filter((d) => d.type === type);
    return { type, n: ds.length, agree: ds.filter((d) => d.agree).length, meanDelta: ds.length ? ds.reduce((s, d) => s + d.delta, 0) / ds.length : 0 };
  });
  const byQuestion = [...new Set(all.map((d) => d.id))].map((id) => {
    const ds = all.filter((d) => d.id === id);
    return { id, type: ds[0]!.type, n: ds.length, agree: ds.filter((d) => d.agree).length };
  });
  const layaMs = rs.map((r) => r.laya.latencyMs);
  const jevMs = rs.map((r) => r.trace.originalLatencyMs ?? r.trace.latencyMs);
  const truncated = { requests: rs.filter((r) => r.laya.usage?.truncated).length, stateTokensDropped: rs.reduce((s, r) => s + (r.laya.usage?.state_tokens_dropped ?? 0), 0), questions: rs.reduce((s, r) => s + (r.laya.usage?.truncated_questions?.length ?? 0), 0) };

  console.log(`\n== ${scenario}: ${rs.length} requests, ${all.length} answers · agreement with Jev ${pct(all.filter((d) => d.agree).length, all.length)} · latency p50 Laya ${median(layaMs)} ms vs Jev ${median(jevMs)} ms (Jev measured from this network on its run date)`);
  console.log(`truncated: ${truncated.requests}/${rs.length} requests · ${truncated.questions} questions cut · ${truncated.stateTokensDropped} state tokens dropped`);
  console.table(byType.map((t) => ({ type: t.type, answers: t.n, agree: pct(t.agree, t.n), meanDelta: t.meanDelta.toFixed(3) })));
  console.table(byQuestion.map((q) => ({ question: q.id, type: q.type, agree: `${q.agree}/${q.n}` })));

  // B4 has labelled outcomes: run the real dispatcher on both answer sets.
  let outcome: Record<string, unknown>[] | undefined;
  if (scenario === "b4") {
    outcome = EXAMPLE_REQUESTS.flatMap((e) => {
      const r = rs.find((x) => (x.trace.request.state as { request?: string }).request === e.text);
      if (!r) return [];
      const jevKind = dispatch(r.trace.response.answers, e.text).kind;
      const layaKind = dispatch(r.laya.answers, e.text).kind;
      return [{ request: e.text, expect: e.expect.join("|"), jev: jevKind, laya: layaKind, jevOk: e.expect.includes(jevKind), layaOk: e.expect.includes(layaKind) }];
    });
    console.table(outcome.map((o) => ({ ...o, laya: `${o.laya}${o.layaOk ? "" : " ✘"}` })));
    console.log(`b4 dispatch hits: Jev ${outcome.filter((o) => o.jevOk).length}/${outcome.length} · Laya ${outcome.filter((o) => o.layaOk).length}/${outcome.length}`);
    const unsafe = outcome.filter((o) => String(o.request).startsWith("unlock") && o.laya === "commands");
    if (unsafe.length) console.log("!! Laya answers would unlock the front door without confirmation");
  }

  (report.scenarios as Record<string, unknown>)[scenario] = {
    requests: rs.length,
    byType,
    byQuestion,
    latencyMs: { layaP50: median(layaMs), layaMax: Math.max(...layaMs), jevP50: median(jevMs) },
    truncated,
    outcome,
    disagreements: all.filter((d) => !d.agree),
    routing: rs[0]!.laya.routing,
  };
}

const variant = [STATE_MODE === "text" ? "text" : "", NOUL_MODE === "choice" ? "noulchoice" : "", GATE === "answer_confidence" ? "answergate" : ""].filter(Boolean).map((v) => `${v}-`).join("");
const out = `${RESULTS_DIR}laya-vs-jev-${scenarios.join("-")}-${variant}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(out, JSON.stringify(report, null, 2));
console.log(`\nwrote ${out}`);
