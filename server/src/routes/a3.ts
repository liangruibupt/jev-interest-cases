import { A3_LINES, A3_PRESET_QUERIES, buildDocumentState, buildFindQuestions, composeFind, type Answers } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

const MAX_QUERY_CHARS = 200;
const DOCUMENT_STATE = buildDocumentState();

/**
 * Semantic find over the 218-line document: one request carrying the whole tagged document as state,
 * a 218-option Choice for relevance and two Nouls. Preset queries are replayable (read-write cache);
 * free text never writes to the committed cache.
 */
export function createA3Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError(apiErrorHandler);

  app.post("/search", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { query?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) throw new BadRequestError("请输入查询");
    if (query.length > MAX_QUERY_CHARS) throw new BadRequestError(`查询不能超过 ${MAX_QUERY_CHARS} 个字符`, { length: query.length });
    const preset = A3_PRESET_QUERIES.some((p) => p.query === query);
    const { result, trace } = await deps.askJev(
      { scenario: "a3", state: DOCUMENT_STATE, questions: buildFindQuestions(query) },
      { cache: preset ? "read-write" : "read-only" },
    );
    usage.record(trace);
    const answers = result.answers as unknown as Answers;
    return c.json({ query, answers, result: composeFind(answers), traces: [trace], lineCount: A3_LINES.length });
  });

  return app;
}

export const a3Routes = createA3Routes({ askJev: defaultAskJev });
