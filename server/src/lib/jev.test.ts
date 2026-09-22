import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuestionValidationError } from "@jev/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFileCache } from "./cache";
import { createJev, type JevLike } from "./jev";
import { createQueue } from "./queue";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

function fakeClient() {
  const systemOne = vi.fn(async () => ({
    model: "jev-1.13.0",
    answers: { urgent: { type: "noul" as const, noul: 0.93 } },
    usage: { input_tokens: 300, output_tokens: 20 },
  }));
  const client: JevLike = { defaultModel: "jev-latest", systemOne: systemOne as unknown as JevLike["systemOne"] };
  return { client, systemOne };
}

const questions = { urgent: { type: "noul" as const, instructions: "Is it urgent?" } };

describe("askJev", () => {
  it("calls the client once, records a trace with latency and cost, then serves the second call from cache", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });

    const first = await askJev({ scenario: "p0", state: "help now", questions }, { cache: "read-write" });
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(first.result.answers.urgent.noul).toBe(0.93);
    expect(first.trace.kind).toBe("jev");
    expect(first.trace.cached).toBe(false);
    expect(first.trace.model).toBe("jev-1.13.0");
    expect(first.trace.request.model).toBe("jev-latest");
    expect(first.trace.cost.usd).toBeCloseTo((300 / 1e6) * 0.042, 12);
    expect(first.trace.latencyMs).toBeGreaterThanOrEqual(0);

    const second = await askJev({ scenario: "p0", state: "help now", questions }, { cache: "read-write" });
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(second.trace.cached).toBe(true);
    expect(second.trace.cost.usd).toBe(0);
    expect(second.trace.latencyMs).toBe(0);
    expect(second.trace.originalLatencyMs).toBe(first.trace.latencyMs);
    expect(second.result.answers.urgent.noul).toBe(0.93);
    expect(second.trace.id).not.toBe(first.trace.id);
  });

  it("bypasses the cache when mode is off", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });
    await askJev({ scenario: "p0", state: "x", questions }, { cache: "off" });
    await askJev({ scenario: "p0", state: "x", questions }, { cache: "off" });
    expect(systemOne).toHaveBeenCalledTimes(2);
  });

  it("validates questions before touching the client", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });
    await expect(askJev({ scenario: "p0", state: "x", questions: {} }, { cache: "off" })).rejects.toBeInstanceOf(QuestionValidationError);
    expect(systemOne).not.toHaveBeenCalled();
  });
});
