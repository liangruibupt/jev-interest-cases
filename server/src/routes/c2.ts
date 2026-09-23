import { C2_QUESTIONS, PATIENT_MESSAGES, buildPatientState, type Answers, type JevTrace } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface TriageBody {
  ids?: unknown;
  live?: unknown;
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
    if (body.ids !== undefined && !(Array.isArray(body.ids) && body.ids.every((s) => typeof s === "string"))) throw new BadRequestError("ids 必须是字符串数组");
    const wanted = (body.ids as string[] | undefined) ?? PATIENT_MESSAGES.map((m) => m.id);
    const unknown = wanted.filter((id) => !PATIENT_MESSAGES.some((m) => m.id === id));
    if (unknown.length) throw new BadRequestError(`未知的留言 ID：${unknown.join(", ")}`, { unknown });
    const messages = PATIENT_MESSAGES.filter((m) => wanted.includes(m.id));
    const cache = body.live === true ? "off" : "read-write";
    // Record each completed call as it lands so one failure never discards the others.
    const traces: JevTrace[] = [];
    const settled = await Promise.allSettled(
      messages.map(async (m) => {
        const o = await deps.askJev({ scenario: "c2", state: buildPatientState(m), questions: C2_QUESTIONS }, { cache });
        usage.record(o.trace);
        traces.push(o.trace);
        return o;
      }),
    );
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const errors: Record<string, string> = {};
    settled.forEach((s, i) => {
      const id = messages[i]!.id;
      if (s.status === "fulfilled") results[id] = { answers: s.value.result.answers as unknown as Answers, traceId: s.value.trace.id };
      else errors[id] = s.reason instanceof Error ? s.reason.message : String(s.reason);
    });
    return c.json({ results, errors, traces, model: traces[0]?.model ?? null });
  });

  return app;
}

export const c2Routes = createC2Routes({ askJev: defaultAskJev });
