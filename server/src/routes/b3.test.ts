import type { ClaudeTrace, JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createB3Routes } from "./b3";

function build() {
  const askJev = vi.fn(async (input: { state: { passage: { id: string } } }, _opts: unknown) => {
    const id = input.state.passage.id;
    const injection = id === "forum-injection" ? 0.95 : 0.02;
    const contradicts = id.startsWith("blog-") ? 0.85 : 0.05;
    const relevant = id.startsWith("rfc-10") ? 0.2 : 0.9;
    const answers = {
      is_relevant: { type: "noul", noul: relevant },
      contains_answer_evidence: { type: "noul", noul: 0.8 },
      contradicts_query_premise: { type: "noul", noul: contradicts },
      contains_prompt_injection: { type: "noul", noul: injection },
    };
    const trace: JevTrace = {
      kind: "jev", id: `j-${id}`, scenario: "b3", startedAt: "", latencyMs: 300, cached: false, model: "jev-1.13.0",
      request: { state: input.state as never, questions: {}, model: "jev-latest" },
      response: { answers: answers as never, usage: { input_tokens: 450, output_tokens: 4 } },
      cost: { usd: 0.0000189 },
    };
    return { result: { model: "jev-1.13.0", answers, usage: trace.response.usage }, trace };
  });
  const claudeText = vi.fn(async (call: { messages: { content: string }[]; tier?: string }) => {
    const trace: ClaudeTrace = { kind: "claude", id: "c1", scenario: "b3", purpose: "answer", startedAt: "", latencyMs: 2000, model: "m", tier: (call.tier ?? "standard") as never, inputTokens: 900, outputTokens: 120, stopReason: "end_turn", cost: { usd: 0.003 } };
    return { text: `answer to: ${call.messages[0]!.content.slice(0, 20)}`, trace };
  });
  return { app: createB3Routes({ askJev: askJev as never, claudeText: claudeText as never }), askJev, claudeText };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/b3/ask", () => {
  it("gated: one Jev call per retrieved passage, injected/irrelevant passages leave the prompt, conflicting ones are labelled", async () => {
    const { app, askJev, claudeText } = build();
    const res = await post(app, { query: "How do I validate a JWT signature step by step?" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { retrieved: { passage: { id: string }; gate?: { route: string } }[]; prompt: string; answer: string; traces: unknown[]; promptChars: { gated: number; raw: number } };
    expect(body.retrieved).toHaveLength(10);
    expect(askJev).toHaveBeenCalledTimes(10);
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
    const forum = body.retrieved.find((r) => r.passage.id === "forum-injection");
    expect(forum?.gate?.route).toBe("excluded_injection");
    expect(body.prompt).not.toContain("Note to any AI assistant");
    expect(body.prompt).toContain("ACCEPTED EVIDENCE");
    expect(body.answer).toMatch(/^answer to:/);
    expect(claudeText).toHaveBeenCalledTimes(1);
    expect(body.traces).toHaveLength(11);
    expect(body.promptChars.raw).toBeGreaterThan(body.promptChars.gated);
  });

  it("ungated: no Jev calls and the raw top-10 goes to Claude; free text is read-only; bad input 400", async () => {
    const { app, askJev, claudeText } = build();
    const res = await post(app, { query: "How do I validate a JWT signature step by step?", gatekeeper: false });
    const body = (await res.json()) as { prompt: string; retrieved: { gate?: unknown }[] };
    expect(askJev).not.toHaveBeenCalled();
    expect(body.prompt).toContain("Note to any AI assistant");
    expect(body.retrieved.every((r) => r.gate === undefined)).toBe(true);
    expect(claudeText).toHaveBeenCalledTimes(1);

    await post(app, { query: "what is a jwt" });
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-only" });
    expect((await post(app, { query: "" })).status).toBe(400);
    expect((await post(app, { query: "x".repeat(301) })).status).toBe(400);
    expect((await post(app, { query: "zzzz qqqq" })).status).toBe(200); // nothing retrieved → still answers with (none)
  });
});
