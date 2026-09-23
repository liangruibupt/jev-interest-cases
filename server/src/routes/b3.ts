import { B3_PRESET_QUERIES, B3_QUESTIONS, CORPUS, buildEvidencePrompt, buildIndex, buildPassageState, buildRawPrompt, gatePassage, passageById, search, type Answers, type ClaudeTierId, type GateResult, type Passage, type Trace } from "@jev/shared";
import { Hono } from "hono";
import { claudeText as defaultClaudeText } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

const MAX_QUERY_CHARS = 300;
const TOP_K = 10;
const INDEX = buildIndex(CORPUS);

export const ANSWER_SYSTEM =
  "You answer questions about RFC 7519 (JSON Web Token) using only the evidence blocks in the user message. " +
  "Prefer passages whose source is rfc over forum or blog, and say which source you relied on. " +
  "If a CONFLICTING EVIDENCE block contradicts a premise of the question, say so first and correct the premise. " +
  "If the evidence is insufficient to answer, say so plainly instead of guessing. Keep the answer under 150 words.";

interface AskBody {
  query?: unknown;
  gatekeeper?: unknown;
  tier?: unknown;
}

interface Retrieved {
  passage: Passage;
  bm25: number;
  answers?: Answers;
  gate?: GateResult;
}

/**
 * BM25 top-k → (gatekeeper) one Jev request per passage → ordered gate → Claude answers from the
 * accepted evidence only. With the gatekeeper off the raw top-k goes straight to Claude for contrast.
 */
export function createB3Routes(deps: { askJev: typeof defaultAskJev; claudeText: typeof defaultClaudeText }) {
  const app = new Hono();
  app.onError(apiErrorHandler);
  const answerCache = new Map<string, { text: string; trace: Trace }>();

  app.post("/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as AskBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) throw new BadRequestError("请输入问题");
    if (query.length > MAX_QUERY_CHARS) throw new BadRequestError(`问题不能超过 ${MAX_QUERY_CHARS} 个字符`, { length: query.length });
    const gatekeeper = body.gatekeeper !== false;
    const tier: ClaudeTierId = body.tier === "strong" ? "strong" : "standard";
    const preset = B3_PRESET_QUERIES.some((p) => p.query === query);

    const hits = search(INDEX, query, TOP_K);
    const retrieved: Retrieved[] = hits.map((h) => ({ passage: passageById(h.id)!, bm25: h.score }));
    const traces: Trace[] = [];

    if (gatekeeper) {
      const outcomes = await Promise.all(
        retrieved.map((r) => deps.askJev({ scenario: "b3", state: buildPassageState(query, r.passage), questions: B3_QUESTIONS }, { cache: preset ? "read-write" : "read-only" })),
      );
      outcomes.forEach((o, i) => {
        const answers = o.result.answers as unknown as Answers;
        retrieved[i]!.answers = answers;
        retrieved[i]!.gate = gatePassage(answers);
        traces.push(o.trace);
        usage.record(o.trace);
      });
    }

    const accepted = retrieved.filter((r) => r.gate?.route === "accepted").map((r) => r.passage);
    const conflicting = retrieved.filter((r) => r.gate?.route === "conflicting").map((r) => r.passage);
    const rawPrompt = buildRawPrompt(query, retrieved.map((r) => r.passage));
    const gatedPrompt = buildEvidencePrompt(query, accepted, conflicting);
    const prompt = gatekeeper ? gatedPrompt : rawPrompt;

    const key = `${tier}::${gatekeeper}::${query}`;
    let cached = answerCache.get(key);
    const wasCached = Boolean(cached);
    if (!cached) {
      const { text, trace } = await deps.claudeText({ scenario: "b3", purpose: gatekeeper ? "answer:gated" : "answer:raw", tier, system: ANSWER_SYSTEM, messages: [{ role: "user", content: prompt }], maxTokens: 500, effort: "low" });
      cached = { text, trace };
      answerCache.set(key, cached);
      usage.record(trace);
    }
    if (!wasCached) traces.push(cached.trace);

    return c.json({
      query,
      gatekeeper,
      tier,
      retrieved,
      prompt,
      promptChars: { gated: gatedPrompt.length, raw: rawPrompt.length },
      answer: cached.text,
      answerCached: wasCached,
      traces,
    });
  });

  return app;
}

export const b3Routes = createB3Routes({ askJev: defaultAskJev, claudeText: defaultClaudeText });
