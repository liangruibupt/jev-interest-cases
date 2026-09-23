import { C4_QUESTIONS, VPP_NOTICES, VPP_SITES, buildPairState, type Answers, type JevTrace } from "@jev/shared";
import { Hono } from "hono";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface ApplyBody {
  noticeIds?: unknown;
  live?: unknown;
}

export const pairKey = (noticeId: string, siteId: string): string => `${noticeId}:${siteId}`;

/** One Jev request per (notice, site) pair; routes are composed in the browser. Pure Jev. */
export function createC4Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError(apiErrorHandler);

  app.post("/apply", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as ApplyBody;
    if (body.noticeIds !== undefined && !(Array.isArray(body.noticeIds) && body.noticeIds.every((s) => typeof s === "string"))) throw new BadRequestError("noticeIds 必须是字符串数组");
    const wanted = (body.noticeIds as string[] | undefined) ?? VPP_NOTICES.map((n) => n.id);
    const unknown = wanted.filter((id) => !VPP_NOTICES.some((n) => n.id === id));
    if (unknown.length) throw new BadRequestError(`未知的通知 ID：${unknown.join(", ")}`, { unknown });
    const notices = VPP_NOTICES.filter((n) => wanted.includes(n.id));
    const cache = body.live === true ? "off" : "read-write";
    const pairs = notices.flatMap((n) => VPP_SITES.map((s) => ({ n, s })));
    const traces: JevTrace[] = [];
    const settled = await Promise.allSettled(
      pairs.map(async ({ n, s }) => {
        const o = await deps.askJev({ scenario: "c4", state: buildPairState(n, s), questions: C4_QUESTIONS }, { cache });
        usage.record(o.trace);
        traces.push(o.trace);
        return o;
      }),
    );
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const errors: Record<string, string> = {};
    settled.forEach((r, i) => {
      const key = pairKey(pairs[i]!.n.id, pairs[i]!.s.id);
      if (r.status === "fulfilled") results[key] = { answers: r.value.result.answers as unknown as Answers, traceId: r.value.trace.id };
      else errors[key] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    });
    return c.json({ results, errors, traces, model: traces[0]?.model ?? null });
  });

  return app;
}

export const c4Routes = createC4Routes({ askJev: defaultAskJev });
