import { B2_QUESTIONS, RFC_SECTIONS, buildClaimState, rfcBodyForPrompt, stringStage, verdictFromAnswers, type Answers, type Citation, type ClaimVerdict, type ClaudeTierId, type Trace } from "@jev/shared";
import { Hono } from "hono";
import { z } from "zod";
import { claudeParse as defaultClaudeParse } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

const MAX_QUESTION_CHARS = 500;
const MAX_CLAIMS = 12;
const TIERS: ClaudeTierId[] = ["standard", "strong"];

const AnswerSchema = z.object({
  answer: z.string(),
  claims: z.array(z.object({ claim: z.string(), section_id: z.string(), quote: z.string() })).min(1).max(8),
});
type Answer = z.infer<typeof AnswerSchema>;

export const ANSWER_SYSTEM = [
  "You answer questions about RFC 7519 (JSON Web Token) using ONLY the RFC text supplied in the user message.",
  "Write a concise answer (at most 150 words). Then list 2 to 6 claims that your answer relies on.",
  "For each claim give: the claim in your own words, the section_id it comes from (one of the section numbers shown as '## <id>' in the text), and a quote copied VERBATIM from that section (at most 40 words, no paraphrase, no ellipsis).",
  "If the RFC does not address the question, say so in the answer and cite the closest relevant section.",
].join(" ");

interface AnswerCache {
  answer: string;
  claims: Citation[];
  trace: Trace;
}

/** Claude writes with citations; code and Jev check them. */
export function createB2Routes(deps: { askJev: typeof defaultAskJev; claudeParse: typeof defaultClaudeParse }) {
  const app = new Hono();
  app.onError(apiErrorHandler);
  const answers = new Map<string, AnswerCache>();

  app.get("/sections", (c) => c.json({ sections: RFC_SECTIONS }));

  app.post("/answer", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { question?: string; tier?: ClaudeTierId; injectErrors?: boolean };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) throw new BadRequestError("question 不能为空");
    if (question.length > MAX_QUESTION_CHARS) throw new BadRequestError(`question 最多 ${MAX_QUESTION_CHARS} 字符`);
    const tier = body.tier ?? "standard";
    if (!TIERS.includes(tier)) throw new BadRequestError(`tier 只能是 ${TIERS.join(" / ")}`);
    const key = `${tier}::${question}`;
    let cached = answers.get(key);
    const wasCached = Boolean(cached);
    if (!cached) {
      const { parsed, trace } = await deps.claudeParse<Answer>({
        scenario: "b2",
        purpose: "answer_with_citations",
        tier,
        system: ANSWER_SYSTEM,
        messages: [{ role: "user", content: `RFC 7519, sections 1-12:\n\n${rfcBodyForPrompt()}\n\n---\nQuestion: ${question}` }],
        maxTokens: 1500,
        effort: "low",
        schema: AnswerSchema,
      });
      usage.record(trace);
      cached = { answer: parsed.answer, claims: parsed.claims.map((cl, i) => ({ id: `c${i + 1}`, ...cl })), trace };
      answers.set(key, cached);
    }
    let claims = cached.claims.map((cl) => ({ ...cl }));
    if (body.injectErrors) claims = injectErrors(claims);
    return c.json({ answer: cached.answer, claims, tier, cached: wasCached, traces: wasCached ? [] : [cached.trace] });
  });

  app.post("/verify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { claims?: Citation[] };
    const claims = Array.isArray(body.claims) ? body.claims : [];
    if (claims.length === 0) throw new BadRequestError("claims 不能为空");
    if (claims.length > MAX_CLAIMS) throw new BadRequestError(`一次最多核验 ${MAX_CLAIMS} 条引用`);
    const traces: Trace[] = [];
    const results = await Promise.all(
      claims.map(async (cl, i): Promise<ClaimVerdict> => {
        const citation: Citation = { id: cl.id ?? `c${i + 1}`, claim: String(cl.claim ?? ""), section_id: String(cl.section_id ?? ""), quote: String(cl.quote ?? "") };
        const settled = stringStage(citation, RFC_SECTIONS);
        if (settled) return settled;
        const section = RFC_SECTIONS.find((s) => s.id === citation.section_id)!;
        const { result, trace } = await deps.askJev(
          { scenario: "b2", state: buildClaimState(citation.claim, section, citation.quote), questions: B2_QUESTIONS },
          { cache: "read-write" },
        );
        usage.record(trace);
        traces.push(trace);
        return verdictFromAnswers(citation, result.answers as unknown as Answers);
      }),
    );
    return c.json({ results, traces });
  });

  return app;
}

/** Deterministic corruption for the demo: misattribute the first claim, fabricate the second. */
function injectErrors(claims: Citation[]): Citation[] {
  const out = claims.map((c) => ({ ...c }));
  if (out[0]) {
    const idx = RFC_SECTIONS.findIndex((s) => s.id === out[0]!.section_id);
    out[0].section_id = RFC_SECTIONS[(idx + 1) % RFC_SECTIONS.length]!.id;
  }
  if (out[1]) out[1].quote = `Never ${out[1].quote.split(" ").slice(1).join(" ")}`;
  return out;
}

export const b2Routes = createB2Routes({ askJev: defaultAskJev, claudeParse: defaultClaudeParse });
