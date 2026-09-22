import { z } from "zod";
import { CLAUDE_TIERS, CLAUDE_TIER_IDS } from "../shared/src/index";
import { claudeParse, claudeText } from "../server/src/lib/claude";
import { askJev } from "../server/src/lib/jev";

type Row = { probe: string; ok: boolean; model: string; latencyMs: number | null; usd: number | null; note: string };
const rows: Row[] = [];
const fmtUsd = (v: number | null) => (v === null ? "-" : `$${v.toFixed(6)}`);

async function probeJev(): Promise<boolean> {
  if (!process.env.TYPESAFE_API_KEY) {
    rows.push({ probe: "Jev", ok: false, model: "-", latencyMs: null, usd: null, note: "TYPESAFE_API_KEY 未设置（写入 .env）" });
    return false;
  }
  try {
    const { result, trace } = await askJev(
      {
        scenario: "p0",
        state: "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
        questions: { is_urgent: { type: "noul", instructions: "Does this message express urgency?" } },
      },
      { cache: "off" },
    );
    rows.push({ probe: "Jev", ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `is_urgent=${result.answers.is_urgent.noul.toFixed(2)}, tokens=${trace.response.usage.input_tokens}` });
    return true;
  } catch (err) {
    rows.push({ probe: "Jev", ok: false, model: "-", latencyMs: null, usd: null, note: (err as Error).message });
    return false;
  }
}

async function probeClaude(): Promise<void> {
  const tiers = CLAUDE_TIER_IDS.filter((id) => CLAUDE_TIERS[id].enabledByDefault || process.argv.includes("--all-tiers"));
  for (const id of tiers) {
    const tier = CLAUDE_TIERS[id];
    try {
      const { text, trace } = await claudeText({ scenario: "p0", purpose: "check-env", tier: id, maxTokens: 32, messages: [{ role: "user", content: "Reply with the single word OK." }] });
      rows.push({ probe: `${tier.label} text`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: text.trim().slice(0, 20) });
    } catch (err) {
      rows.push({ probe: `${tier.label} text`, ok: false, model: tier.modelId, latencyMs: null, usd: null, note: (err as Error).message.slice(0, 120) });
      continue;
    }
    try {
      const { parsed, trace } = await claudeParse({
        scenario: "p0",
        purpose: "check-env",
        tier: id,
        maxTokens: 64,
        messages: [{ role: "user", content: "Is the sky blue on a clear day? Answer in the required structure." }],
        schema: z.object({ ok: z.boolean() }),
      });
      rows.push({ probe: `${tier.label} parse`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `structured output OK (${JSON.stringify(parsed)})` });
    } catch (err) {
      rows.push({ probe: `${tier.label} parse`, ok: false, model: tier.modelId, latencyMs: null, usd: null, note: `结构化输出不可用: ${(err as Error).message.slice(0, 100)}` });
    }
  }
}

const jevOk = await probeJev();
await probeClaude();

console.log("\nJev Lab 环境检查\n");
console.table(rows.map((r) => ({ ...r, latencyMs: r.latencyMs ?? "-", usd: fmtUsd(r.usd), ok: r.ok ? "✔" : "✘" })));
console.log(`AWS_PROFILE=${process.env.AWS_PROFILE ?? "(default)"} AWS_REGION=${process.env.AWS_REGION ?? "us-east-1"} JEV_CACHE=${process.env.JEV_CACHE ?? "read-write"}`);
process.exit(jevOk ? 0 : 1);
