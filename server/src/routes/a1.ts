import { A1_LIMITS, QuestionValidationError, type EntryType, type Questions } from "@jev/shared";
import { Hono } from "hono";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface EvaluateBody {
  state: EntryType;
  questions: Questions;
  live?: boolean;
}

/** A1 is the only endpoint that accepts client-defined questions, so it enforces size limits. */
export function createA1Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();

  app.post("/evaluate", async (c) => {
    const body = (await c.req.json()) as EvaluateBody;
    const n = Object.keys(body.questions ?? {}).length;
    if (n > A1_LIMITS.maxQuestions) {
      throw new QuestionValidationError([{ questionId: "", message: `最多 ${A1_LIMITS.maxQuestions} 个问题，当前 ${n}` }]);
    }
    const stateChars = typeof body.state === "string" ? body.state.length : JSON.stringify(body.state ?? null).length;
    if (stateChars > A1_LIMITS.maxStateChars) {
      throw new QuestionValidationError([{ questionId: "", message: `state 最多 ${A1_LIMITS.maxStateChars} 字符，当前 ${stateChars}` }]);
    }
    const { result, trace } = await deps.askJev(
      { scenario: "a1", state: body.state, questions: body.questions },
      { cache: body.live ? "off" : "read-write" },
    );
    usage.record(trace);
    return c.json({ answers: result.answers, model: result.model, usage: result.usage, traces: [trace] });
  });

  return app;
}

export const a1Routes = createA1Routes({ askJev: defaultAskJev });
