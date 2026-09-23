import { TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { assertValidQuestions, jevCostUsd, type Answers, type JevTrace, type ScenarioId } from "@jev/shared";
import { JEV_CACHE_DIR, JsonFileCache, cacheKey, resolveCacheMode, type CacheMode } from "./cache";
import { queues, type Queue } from "./queue";
import { newTraceId } from "./trace";

/** The subset of TypeSafeClient we depend on, so tests can inject a fake. */
export interface JevLike {
  readonly defaultModel: string;
  systemOne<Q extends Questions>(request: { state: EntryType; questions: Q; model?: string }): PromiseLike<SystemOneResult<Q>>;
}

export interface AskJevInput<Q extends Questions> {
  scenario: ScenarioId;
  state: EntryType;
  questions: Q;
  model?: string;
}

export interface AskJevOptions {
  cache?: CacheMode;
}

export interface AskJevOutput<Q extends Questions> {
  result: SystemOneResult<Q>;
  trace: JevTrace;
}

export function createJev(deps: { client: () => JevLike; cache?: JsonFileCache<JevTrace>; queue?: Queue }) {
  const cache = deps.cache ?? new JsonFileCache<JevTrace>(JEV_CACHE_DIR);
  const queue = deps.queue ?? queues.jev;

  return async function askJev<Q extends Questions>(input: AskJevInput<Q>, opts: AskJevOptions = {}): Promise<AskJevOutput<Q>> {
    assertValidQuestions(input.questions);
    const client = deps.client();
    const model = input.model ?? client.defaultModel;
    const mode = resolveCacheMode(opts.cache);
    const key = cacheKey({ state: input.state, questions: input.questions, model });

    if (mode !== "off") {
      const hit = await cache.get(key);
      if (hit) {
        const trace: JevTrace = {
          ...hit,
          id: newTraceId(),
          scenario: input.scenario,
          cached: true,
          latencyMs: 0,
          originalLatencyMs: hit.originalLatencyMs ?? hit.latencyMs,
          cost: { usd: 0 },
        };
        return { result: resultFromTrace<Q>(trace), trace };
      }
    }

    let startedAt = new Date().toISOString();
    let latencyMs = 0;
    // Timed inside the queue so latency excludes time spent waiting for a concurrency slot.
    const result = await queue.run(async () => {
      startedAt = new Date().toISOString();
      const t0 = performance.now();
      const r = await client.systemOne({ state: input.state, questions: input.questions, model });
      latencyMs = Math.round(performance.now() - t0);
      return r;
    });
    const trace: JevTrace = {
      kind: "jev",
      id: newTraceId(),
      scenario: input.scenario,
      startedAt,
      latencyMs,
      cached: false,
      model: result.model,
      request: { state: input.state, questions: input.questions, model },
      response: { answers: result.answers as unknown as Answers, usage: result.usage },
      cost: { usd: jevCostUsd(result.usage.input_tokens, result.usage.output_tokens) },
    };
    if (mode === "read-write") await cache.set(key, trace);
    return { result, trace };
  };
}

function resultFromTrace<Q extends Questions>(trace: JevTrace): SystemOneResult<Q> {
  return {
    model: trace.model,
    answers: trace.response.answers as unknown as SystemOneResult<Q>["answers"],
    usage: trace.response.usage,
  };
}

let singleton: TypeSafeClient | undefined;
/** Lazy so importing this module never throws when TYPESAFE_API_KEY is unset (e.g. in tests). */
export function defaultJevClient(): JevLike {
  singleton ??= new TypeSafeClient({
    timeout: 15_000,
    ...(process.env.JEV_MODEL ? { defaultModel: process.env.JEV_MODEL } : {}),
  });
  return singleton;
}

export const askJev = createJev({ client: defaultJevClient });
