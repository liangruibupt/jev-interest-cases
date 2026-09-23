import { CANNED_CITATIONS, type Answers, type JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createB2Routes } from "./b2";

const jevAnswers = (choice: string, conf = 0.95, qs = 0.9): Answers => ({
  relation: { type: "choice", choice, probabilities: { supports: choice === "supports" ? 0.95 : 0.02, contradicts: choice === "contradicts" ? 0.95 : 0.02, says_nothing: choice === "says_nothing" ? 0.95 : 0.03 }, confidence: conf },
  quote_supports: { type: "noul", noul: qs },
});

function build() {
  let n = 0;
  const askJev = vi.fn(async (input: { state: { claim: string } }, _opts: unknown) => {
    n += 1;
    const claim = input.state.claim;
    const a = /required to carry/.test(claim) ? jevAnswers("contradicts", 0.99, 0.05) : /JWKS/.test(claim) ? jevAnswers("says_nothing", 0.6, 0.1) : jevAnswers("supports");
    const trace: JevTrace = { kind: "jev", id: `j${n}`, scenario: "b2", startedAt: "", latencyMs: 120, cached: false, model: "jev-1.13.0", request: { state: input.state as never, questions: {}, model: "jev-latest" }, response: { answers: a, usage: { input_tokens: 900, output_tokens: 20 } }, cost: { usd: 0.0000378 } };
    return { result: { model: "jev-1.13.0", answers: a, usage: trace.response.usage }, trace };
  });
  const claudeParse = vi.fn(async (_call: unknown) => ({
    parsed: {
      answer: "The exp claim allows a small leeway.",
      claims: [
        { claim: "Implementers may allow a few minutes of leeway for clock skew.", section_id: "4.1.4", quote: "Implementers MAY provide for some small leeway, usually no more than a few minutes, to account for clock skew." },
        { claim: "Use of exp is optional.", section_id: "4.1.4", quote: "Use of this claim is OPTIONAL." },
      ],
    },
    trace: { kind: "claude" as const, id: "c1", scenario: "b2" as const, purpose: "answer", startedAt: "", latencyMs: 6000, tier: "standard" as const, model: "m", inputTokens: 12000, outputTokens: 300, cost: { usd: 0.027 }, stopReason: "end_turn" },
  }));
  return { app: createB2Routes({ askJev: askJev as never, claudeParse: claudeParse as never }), askJev, claudeParse };
}
const post = (app: ReturnType<typeof build>["app"], path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("B2 routes", () => {
  it("verifies canned citations: string stage settles two without Jev, Jev judges the rest", async () => {
    const { app, askJev } = build();
    const res = await post(app, "/verify", { claims: CANNED_CITATIONS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { id: string; verdict: string; review: boolean }[]; traces: unknown[] };
    expect(askJev).toHaveBeenCalledTimes(6);
    expect(body.traces).toHaveLength(6);
    const by = Object.fromEntries(body.results.map((r) => [r.id, r]));
    expect(by.jti_uuid?.verdict).toBe("fabricated");
    expect(by.encryption_optional_misattributed?.verdict).toBe("misattributed");
    expect(by.exp_required?.verdict).toBe("contradicted");
    expect(by.jwks_required?.verdict).toBe("unsupported");
    expect(by.jwks_required?.review).toBe(true);
    expect(by.exp_leeway?.verdict).toBe("verified");
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
  });

  it("answers with citations via Claude, assigns ids, caches per question+tier, and can inject errors", async () => {
    const { app, claudeParse } = build();
    const first = (await (await post(app, "/answer", { question: "How does exp handle clock skew?" })).json()) as { claims: { id: string; section_id: string; quote: string }[]; tier: string; cached: boolean };
    expect(first.claims.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(first.tier).toBe("standard");
    expect(first.cached).toBe(false);
    const second = (await (await post(app, "/answer", { question: "How does exp handle clock skew?" })).json()) as { cached: boolean };
    expect(second.cached).toBe(true);
    expect(claudeParse).toHaveBeenCalledTimes(1);
    const injected = (await (await post(app, "/answer", { question: "How does exp handle clock skew?", injectErrors: true })).json()) as { claims: { section_id: string; quote: string }[] };
    expect(injected.claims[0]?.section_id).not.toBe("4.1.4");
    expect(injected.claims[1]?.quote.startsWith("Never ")).toBe(true);
    const call = claudeParse.mock.calls[0]?.[0] as { tier: string; system: string; messages: { content: string }[] };
    expect(call.tier).toBe("standard");
    expect(call.messages[0]?.content).toContain("## 4.1.4");
  });

  it("validates input and serves sections", async () => {
    const { app } = build();
    expect((await post(app, "/answer", { question: "" })).status).toBe(400);
    expect((await post(app, "/answer", { question: "x", tier: "haiku" })).status).toBe(400);
    expect((await post(app, "/verify", { claims: Array.from({ length: 13 }, () => CANNED_CITATIONS[0]) })).status).toBe(400);
    const s = (await (await app.request("/sections")).json()) as { sections: { id: string }[] };
    expect(s.sections.length).toBe(45);
  });
});
