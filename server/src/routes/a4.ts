import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { A4_ARMS, A4_CASES, A4_LIMITS, estimateRunCost, type A4CaseId, type Answers, type ArmId, type EntryType, type RunRecord } from "@jev/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestError, toHttpError } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { askLlmSystemOne as defaultAskLlmSystemOne } from "../lib/llmSystemOne";
import { usage } from "../lib/usage";

const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("../../../docs/results/", import.meta.url));

interface Deps {
  askJev: typeof defaultAskJev;
  askLlmSystemOne: typeof defaultAskLlmSystemOne;
  /** Where finished experiments are written; null disables export (tests). */
  resultsDir?: string | null;
}

/**
 * SSE experiment runner. Arms run concurrently; runs within an arm run sequentially so each
 * per-call latency is honest. Jev always bypasses the cache; LLM arms go through the adapter.
 */
export function createA4Routes(deps: Deps) {
  const resultsDir = deps.resultsDir === undefined ? DEFAULT_RESULTS_DIR : deps.resultsDir;
  const app = new Hono();
  app.onError((err, c) => {
    const e = toHttpError(err);
    return c.json({ error: e }, e.status as 500);
  });

  app.get("/run", (c) => {
    const caseId = c.req.query("caseId") as A4CaseId | undefined;
    const a4case = A4_CASES.find((x) => x.id === caseId);
    if (!a4case) throw new BadRequestError(`未知的案例：${caseId ?? "(空)"}`);
    const runs = Math.min(A4_LIMITS.maxRuns, Math.max(A4_LIMITS.minRuns, Number(c.req.query("runs") ?? 10) || A4_LIMITS.minRuns));
    const armIds = (c.req.query("arms") ?? "jev").split(",").filter(Boolean) as ArmId[];
    const unknown = armIds.filter((id) => !A4_ARMS.some((a) => a.id === id));
    if (unknown.length) throw new BadRequestError(`未知的臂：${unknown.join(", ")}`);
    if (armIds.length === 0 || armIds.length > A4_LIMITS.maxArms) throw new BadRequestError(`臂数量必须在 1 到 ${A4_LIMITS.maxArms} 之间`);
    const nonce = c.req.query("nonce") === "1";
    const startedAt = new Date().toISOString();
    const records: RunRecord[] = [];

    const stateFor = (run: number): EntryType => {
      if (!nonce) return a4case.state;
      const base = a4case.state;
      const uid = `${a4case.id}:${run}:${Math.random().toString(36).slice(2, 8)}`;
      return base && typeof base === "object" && !Array.isArray(base) ? { ...base, uid } : { state: base, uid };
    };

    const runOnce = async (armId: ArmId, run: number): Promise<RunRecord> => {
      const arm = A4_ARMS.find((a) => a.id === armId)!;
      const state = stateFor(run);
      if (arm.kind === "jev") {
        const { result, trace } = await deps.askJev({ scenario: "a4", state, questions: a4case.questions }, { cache: "off" });
        usage.record(trace);
        return {
          arm: armId, run, answers: result.answers as unknown as Answers, latencyMs: trace.latencyMs, costUsd: trace.cost.usd,
          inputTokens: trace.response.usage.input_tokens, outputTokens: trace.response.usage.output_tokens, traceId: trace.id,
        };
      }
      const out = await deps.askLlmSystemOne({
        scenario: "a4", state, questions: a4case.questions, tier: arm.tier!,
        ...(arm.temperature !== undefined ? { temperature: arm.temperature } : {}),
      });
      usage.record(out.trace);
      return {
        arm: armId, run, answers: out.answers, latencyMs: out.trace.latencyMs, costUsd: out.trace.cost.usd,
        inputTokens: out.trace.inputTokens, outputTokens: out.trace.outputTokens, traceId: out.trace.id,
        degenerate: out.debug.degenerate, normalizationDelta: out.debug.normalizationDelta,
      };
    };

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      await send("start", { caseId: a4case.id, runs, arms: armIds, nonce, estimatedUsd: estimateRunCost(a4case.id, armIds, runs).usd, startedAt });
      await Promise.all(
        armIds.map(async (armId) => {
          for (let run = 1; run <= runs; run++) {
            try {
              const record = await runOnce(armId, run);
              records.push(record);
              await send("run", record);
            } catch (err) {
              await send("arm_error", { arm: armId, run, message: toHttpError(err).message });
            }
          }
        }),
      );
      let savedTo: string | null = null;
      if (resultsDir && records.length) {
        await mkdir(resultsDir, { recursive: true });
        const file = `a4-${a4case.id}-${startedAt.replace(/[:.]/g, "-")}.json`;
        await writeFile(`${resultsDir}${file}`, JSON.stringify({ caseId: a4case.id, runs, arms: armIds, nonce, startedAt, finishedAt: new Date().toISOString(), records }, null, 2));
        savedTo = `docs/results/${file}`;
      }
      await send("done", { savedTo, totalUsd: records.reduce((s, r) => s + r.costUsd, 0), records: records.length });
    });
  });

  /** Saved experiments (docs/results/a4-*.json) so the page can replay without spending. */
  app.get("/results", async (c) => {
    if (!resultsDir) return c.json({ files: [] });
    const files = (await readdir(resultsDir).catch(() => [] as string[])).filter((f) => /^a4-.*\.json$/.test(f)).sort().reverse();
    return c.json({ files });
  });
  app.get("/results/:file", async (c) => {
    const file = c.req.param("file");
    if (!resultsDir || !/^a4-[A-Za-z0-9-]+\.json$/.test(file)) throw new BadRequestError("无效的结果文件名");
    const text = await readFile(`${resultsDir}${file}`, "utf8").catch(() => null);
    if (text === null) throw new BadRequestError("结果文件不存在");
    return c.body(text, 200, { "content-type": "application/json" });
  });

  return app;
}

export const a4Routes = createA4Routes({ askJev: defaultAskJev, askLlmSystemOne: defaultAskLlmSystemOne });
