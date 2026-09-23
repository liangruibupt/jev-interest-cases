import { A2_QUESTIONS, TICKETS, buildTicketState, type Answers, type JevTrace } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, toHttpError } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface EvaluateBody {
  ticketIds?: string[];
  live?: boolean;
}

/**
 * One Jev request per ticket with all ten questions (speculative fan-out). The server returns raw
 * answers; lane decisions happen in the browser via `compose()` so sliders never trigger inference.
 */
export function createA2Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError((err, c) => {
    const e = toHttpError(err);
    return c.json({ error: e }, e.status as 500);
  });

  app.post("/evaluate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as EvaluateBody;
    const wanted = body.ticketIds ?? TICKETS.map((t) => t.id);
    const unknown = wanted.filter((id) => !TICKETS.some((t) => t.id === id));
    if (unknown.length) throw new BadRequestError(`未知的工单 ID：${unknown.join(", ")}`, { unknown });
    const tickets = TICKETS.filter((t) => wanted.includes(t.id));
    const cache = body.live ? "off" : "read-write";

    const outcomes = await Promise.all(
      tickets.map((t) => deps.askJev({ scenario: "a2", state: buildTicketState(t), questions: A2_QUESTIONS }, { cache })),
    );
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const traces: JevTrace[] = [];
    outcomes.forEach((o, i) => {
      const id = tickets[i]!.id;
      results[id] = { answers: o.result.answers as unknown as Answers, traceId: o.trace.id };
      traces.push(o.trace);
      usage.record(o.trace);
    });
    return c.json({ results, traces, model: outcomes[0]?.trace.model ?? null });
  });

  return app;
}

export const a2Routes = createA2Routes({ askJev: defaultAskJev });
