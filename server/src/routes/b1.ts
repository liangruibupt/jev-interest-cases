import { B1_POLICIES, B1_QUESTIONS, FAQ, GUARDRAIL_MESSAGES, buildMessageState, claudeCostUsd, decide, type Answers, type B1Decision, type B1PolicyId, type ClaudeTierId, type Trace } from "@jev/shared";
import { Hono } from "hono";
import { claudeText as defaultClaudeText } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

const MAX_MESSAGE_CHARS = 4000;

export const SUPPORT_SYSTEM =
  "You are a concise, friendly customer-support agent for a small SaaS company. Answer the customer's message in at most 120 words. If you do not know a company-specific fact, say so and offer to connect them with a human.";
export const MEDICAL_CAUTION =
  " The customer is asking about medication or health. Give general, widely published information only, do not give a personal dosage or diagnosis, and clearly recommend checking the product label or asking a pharmacist or doctor (a healthcare professional).";

export const CANNED_REPLIES = {
  support:
    "I'm really sorry you're feeling this way. You deserve support right now. If you are in immediate danger, please contact your local emergency number. You can also reach a crisis line in your country to talk with someone who can help. I'm passing this conversation to a human colleague so you don't have to wait.",
  block: "I can't help with that request. If you have a question about our product or your account, I'm happy to help with that instead.",
  human: "I've handed this conversation to a human agent. Someone from our team will pick it up shortly and reply here.",
} as const;

export interface B1Reply {
  text: string;
  source: "canned" | "faq" | "claude";
  tier?: ClaudeTierId;
}

export interface B1Body {
  message: string;
  recent_context?: string[];
  policy?: B1PolicyId;
}

/** Jev classifies every message once; code routes; Claude speaks only where the route needs generation. */
export function createB1Routes(deps: { askJev: typeof defaultAskJev; claudeText: typeof defaultClaudeText }) {
  const app = new Hono();
  app.onError(apiErrorHandler);

  app.post("/message", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as B1Body;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new BadRequestError("message 不能为空");
    if (message.length > MAX_MESSAGE_CHARS) throw new BadRequestError(`message 最多 ${MAX_MESSAGE_CHARS} 字符`);
    const policyId = body.policy ?? "strict";
    if (!(policyId in B1_POLICIES)) throw new BadRequestError(`未知的策略：${String(policyId)}`);
    const recent = Array.isArray(body.recent_context) ? body.recent_context.filter((x) => typeof x === "string").slice(-2) : [];
    const canned = GUARDRAIL_MESSAGES.some((m) => m.text === message);

    const { result, trace } = await deps.askJev(
      { scenario: "b1", state: buildMessageState(message, recent), questions: B1_QUESTIONS },
      { cache: canned ? "read-write" : "read-only" },
    );
    usage.record(trace);
    const answers = result.answers as unknown as Answers;
    const decision = decide(answers, B1_POLICIES[policyId]);
    const traces: Trace[] = [trace];

    const reply = await produceReply(decision, message, deps, traces);
    const claudeTrace = traces.find((t) => t.kind === "claude");
    const replyOut = claudeTrace && claudeTrace.kind === "claude" ? claudeTrace.outputTokens : 300;
    const estIn = Math.ceil((message.length + 400) / 4);
    const baseline = {
      allOpusUsd: claudeCostUsd("strong", estIn, replyOut),
      sonnetGuardUsd: claudeCostUsd("standard", trace.response.usage.input_tokens, 200),
      actualClaudeUsd: claudeTrace ? claudeTrace.cost.usd : 0,
    };
    return c.json({ answers, decision, reply, baseline, traces, policy: policyId, canned });
  });

  return app;
}

async function produceReply(decision: B1Decision, message: string, deps: { claudeText: typeof defaultClaudeText }, traces: Trace[]): Promise<B1Reply> {
  switch (decision.route) {
    case "support":
      return { text: CANNED_REPLIES.support, source: "canned" };
    case "block":
      return { text: CANNED_REPLIES.block, source: "canned" };
    case "human":
      return { text: CANNED_REPLIES.human, source: "canned" };
    case "deterministic":
      return { text: decision.faqTopic ? FAQ[decision.faqTopic].answer_en : CANNED_REPLIES.human, source: "faq" };
    case "sonnet":
    case "sonnet_caution":
    case "opus": {
      const tier = decision.tier ?? "standard";
      const { text, trace } = await deps.claudeText({
        scenario: "b1",
        purpose: `reply:${decision.route}`,
        tier,
        system: SUPPORT_SYSTEM + (decision.route === "sonnet_caution" ? MEDICAL_CAUTION : ""),
        messages: [{ role: "user", content: message }],
        maxTokens: 400,
        effort: "low",
      });
      usage.record(trace);
      traces.push(trace);
      return { text, source: "claude", tier };
    }
  }
}

export const b1Routes = createB1Routes({ askJev: defaultAskJev, claudeText: defaultClaudeText });
