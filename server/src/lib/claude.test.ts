import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeRefusalError, ClaudeStructuredOutputError, ClaudeTierError, createClaude, type ClaudeClientLike } from "./claude";
import { createQueue } from "./queue";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "global.anthropic.claude-sonnet-5",
    content: [{ type: "text", text: "hello", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...overrides,
  };
}

function fakeClient(msg: unknown) {
  const create = vi.fn(async (_params: unknown) => msg);
  const parse = vi.fn(async (_params: unknown) => msg);
  const client = { messages: { create, parse } } as unknown as ClaudeClientLike;
  return { client, create, parse };
}

describe("claudeText", () => {
  it("returns text and a priced trace", async () => {
    const { client, create } = fakeClient(message());
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    const { text, trace } = await claudeText({ scenario: "p0", purpose: "test", messages: [{ role: "user", content: "hi" }] });
    expect(text).toBe("hello");
    expect(trace.kind).toBe("claude");
    expect(trace.tier).toBe("standard");
    expect(trace.cost.usd).toBeCloseTo((1000 / 1e6) * 2 + (500 / 1e6) * 10, 9);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: "global.anthropic.claude-sonnet-5", max_tokens: 2048 });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("passes effort and rejects temperature on the 5 family", async () => {
    const { client, create } = fakeClient(message());
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    await claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], effort: "low" });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ output_config: { effort: "low" } });
    await expect(
      claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], temperature: 0 }),
    ).rejects.toBeInstanceOf(ClaudeTierError);
    await claudeText({ scenario: "p0", purpose: "t", tier: "prev_sonnet", messages: [{ role: "user", content: "hi" }], temperature: 0 });
    expect(create.mock.calls[1]?.[0]).toMatchObject({ temperature: 0, model: "global.anthropic.claude-sonnet-4-6" });
  });

  it("throws a typed error on refusal", async () => {
    const { client } = fakeClient(message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } }));
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    await expect(claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ClaudeRefusalError);
  });
});

describe("claudeParse", () => {
  const schema = z.object({ ok: z.boolean() });

  it("returns parsed output and sends output_config.format", async () => {
    const { client, parse } = fakeClient(message({ parsed_output: { ok: true } }));
    const { claudeParse } = createClaude({ client: () => client, queue: createQueue(1) });
    const { parsed, trace } = await claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema });
    expect(parsed).toEqual({ ok: true });
    expect(trace.purpose).toBe("t");
    const params = parse.mock.calls[0]?.[0] as { output_config?: { format?: unknown } };
    expect(params.output_config?.format).toBeDefined();
  });

  it("throws when parsed_output is null or output was truncated", async () => {
    const { client } = fakeClient(message({ parsed_output: null }));
    const { claudeParse } = createClaude({ client: () => client, queue: createQueue(1) });
    await expect(claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema })).rejects.toBeInstanceOf(ClaudeStructuredOutputError);
    const truncated = fakeClient(message({ stop_reason: "max_tokens", parsed_output: { ok: true } }));
    const c2 = createClaude({ client: () => truncated.client, queue: createQueue(1) });
    await expect(c2.claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema })).rejects.toThrow(/max_tokens|maxTokens/);
  });
});
