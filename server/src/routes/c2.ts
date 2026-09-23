import { C2_QUESTIONS, PATIENT_MESSAGES, buildPatientState, type Answers, type JevTrace } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface TriageBody {
  ids?: string[];
  live?: boolean;
}

/**
 * One Jev request per message with the eleven triage questions. Lanes are decided in the browser by the
 * pure `triage()` so threshold sliders never trigger inference. Pure Jev: no generation anywhere.
 */
export function createC2Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError(apiErrorHandler);

  app.post("/triage", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as TriageBody;
    const wanted = body.ids ?? PATIENT_MESSAGES.map((m) => m.id);
    const unknown = wanted.filter((id) => !PATIENT_MESSAGES.some((m) => m.id === id));
    if (unknown.length) throw new BadRequestError(`未知的留言 ID：${unknown.join(", ")}`, { unknown });
    const messages = PATIENT_MESSAGES.filter((m) => wanted.includes(m.id));
    const cache = body.live ? "off" : "read-write";
    const outcomes = await Promise.all(messages.map((m) => deps.askJev({ scenario: "c2", state: buildPatientState(m), questions: C2_QUESTIONS }, { cache })));
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const traces: JevTrace[] = [];
    outcomes.forEach((o, i) => {
      results[messages[i]!.id] = { answers: o.result.answers as unknown as Answers, traceId: o.trace.id };
      traces.push(o.trace);
      usage.record(o.trace);
    });
    return c.json({ results, traces, model: outcomes[0]?.trace.model ?? null });
  });

  return app;
}

export const c2Routes = createC2Routes({ askJev: defaultAskJev });
