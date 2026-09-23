import { C3_QUESTIONS, FILINGS, buildFilingState, type Answers, type JevTrace } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface JudgeBody {
  ids?: unknown;
  live?: unknown;
}

/** One Jev request per announcement with the eight questions; lanes are composed in the browser. Pure Jev. */
export function createC3Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError(apiErrorHandler);

  app.post("/judge", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as JudgeBody;
    if (body.ids !== undefined && !(Array.isArray(body.ids) && body.ids.every((s) => typeof s === "string"))) throw new BadRequestError("ids 必须是字符串数组");
    const wanted = (body.ids as string[] | undefined) ?? FILINGS.map((f) => f.id);
    const unknown = wanted.filter((id) => !FILINGS.some((f) => f.id === id));
    if (unknown.length) throw new BadRequestError(`未知的公告 ID：${unknown.join(", ")}`, { unknown });
    const filings = FILINGS.filter((f) => wanted.includes(f.id));
    const cache = body.live === true ? "off" : "read-write";
    const traces: JevTrace[] = [];
    const settled = await Promise.allSettled(
      filings.map(async (f) => {
        const o = await deps.askJev({ scenario: "c3", state: buildFilingState(f), questions: C3_QUESTIONS }, { cache });
        usage.record(o.trace);
        traces.push(o.trace);
        return o;
      }),
    );
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const errors: Record<string, string> = {};
    settled.forEach((s, i) => {
      const id = filings[i]!.id;
      if (s.status === "fulfilled") results[id] = { answers: s.value.result.answers as unknown as Answers, traceId: s.value.trace.id };
      else errors[id] = s.reason instanceof Error ? s.reason.message : String(s.reason);
    });
    return c.json({ results, errors, traces, model: traces[0]?.model ?? null });
  });

  return app;
}

export const c3Routes = createC3Routes({ askJev: defaultAskJev });
