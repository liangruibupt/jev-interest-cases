import { C5_LIMITS, C5_PRESETS, C5_QUESTIONS, buildC5State, soundMixFromAnswers, type Answers } from "@jev/shared";
import { Hono } from "hono";
import { apiErrorHandler, BadRequestError } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

export function createC5Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();
  app.onError(apiErrorHandler);
  app.post("/interpret", async c => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestError("需要 JSON 对象");
    const input = body as { brief?: unknown; live?: unknown };
    if (typeof input.brief !== "string" || input.brief.trim().length < C5_LIMITS.minChars || input.brief.trim().length > C5_LIMITS.maxChars)
      throw new BadRequestError(`描述需要 ${C5_LIMITS.minChars}–${C5_LIMITS.maxChars} 个字符`);
    if (input.live !== undefined && typeof input.live !== "boolean") throw new BadRequestError("live 必须为布尔值");
    const state = buildC5State(input.brief);
    const isPublicPreset = C5_PRESETS.some(p => p.brief === state.brief);
    const { result, trace } = await deps.askJev(
      { scenario: "c5", state, questions: C5_QUESTIONS },
      { cache: input.live ? "off" : isPublicPreset ? "read-write" : "read-only" },
    );
    usage.record(trace);
    const answers = result.answers as unknown as Answers;
    try {
      return c.json({ answers, mix: soundMixFromAnswers(answers, state.brief), traces: [trace] });
    } catch {
      return c.json({ error: { status: 502, code: "jev_invalid_answer", message: "Jev 返回的音乐参数不完整或越界，请重试" }, traces: [trace] }, 502);
    }
  });
  return app;
}
export const c5Routes = createC5Routes({ askJev: defaultAskJev });
