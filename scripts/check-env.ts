import { z } from "zod";
import { A1_PRESETS, CLAUDE_TIERS, CLAUDE_TIER_IDS, GITHUB_TOS_LINES } from "../shared/src/index";
import { claudeParse, claudeText } from "../server/src/lib/claude";
import { askJev } from "../server/src/lib/jev";
import { askLlmSystemOne } from "../server/src/lib/llmSystemOne";

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

/** 218-option Choice over the vendored GitHub ToS (A3 shape) — verifies the option cap and state size. */
async function probeWideChoice(): Promise<void> {
  const state = GITHUB_TOS_LINES.map((l, i) => `L${String(i).padStart(3, "0")}| ${l}`).join("\n");
  const query = "who owns the code I upload?";
  try {
    const { result, trace } = await askJev(
      {
        scenario: "p0",
        state,
        questions: {
          where: { type: "choice", instructions: `Which line of the document contains the answer to: "${query}"?`, criteria: Object.fromEntries(GITHUB_TOS_LINES.map((_, i) => [`L${String(i).padStart(3, "0")}`, null])) },
          exists: { type: "noul", instructions: `Does any line of the document address or answer: "${query}"?` },
        },
      },
      { cache: "off" },
    );
    rows.push({ probe: "Jev 218-option Choice", ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `where=${result.answers.where.choice} p=${(result.answers.where.probabilities[result.answers.where.choice] ?? 0).toFixed(2)}, exists=${result.answers.exists.noul.toFixed(2)}, tokens=${trace.response.usage.input_tokens}` });
  } catch (err) {
    rows.push({ probe: "Jev 218-option Choice", ok: false, model: "-", latencyMs: null, usd: null, note: (err as Error).message.slice(0, 120) });
  }
}

/** LLM System One adapter on the A1 quickstart preset (the A4 comparison path). */
async function probeAdapter(): Promise<void> {
  const preset = A1_PRESETS[0]!;
  try {
    const out = await askLlmSystemOne({ scenario: "p0", state: preset.state, questions: preset.questions, tier: "standard" });
    const dept = out.answers.department;
    const sum = dept && dept.type === "choice" ? Object.values(dept.probabilities).reduce((a, b) => a + b, 0) : NaN;
    rows.push({ probe: "llmSystemOne (Sonnet 5)", ok: true, model: out.trace.model, latencyMs: out.trace.latencyMs, usd: out.traces.reduce((a, t) => a + t.cost.usd, 0), note: `department=${dept && dept.type === "choice" ? dept.choice : "?"}, Σp=${sum.toFixed(3)}, attempts=${out.traces.length}, mode=${out.trace.structuredMode}` });
  } catch (err) {
    rows.push({ probe: "llmSystemOne (Sonnet 5)", ok: false, model: "-", latencyMs: null, usd: null, note: (err as Error).message.slice(0, 120) });
  }
}

async function probeClaude(): Promise<void> {
  const tiers = CLAUDE_TIER_IDS.filter((id) => CLAUDE_TIERS[id].enabledByDefault || process.argv.includes("--all-tiers"));
  for (const id of tiers) {
    const tier = CLAUDE_TIERS[id];
    try {
      const { text, trace } = await claudeText({ scenario: "p0", purpose: "check-env", tier: id, maxTokens: 32, ...(tier.supportsEffort ? { effort: "low" as const } : {}), messages: [{ role: "user", content: "Reply with the single word OK." }] });
      rows.push({ probe: `${tier.label} text${tier.supportsEffort ? ' (effort=low)' : ''}`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: text.trim().slice(0, 20) });
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
      rows.push({ probe: `${tier.label} parse`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `structured output OK via ${trace.structuredMode} (${JSON.stringify(parsed)})` });
    } catch (err) {
      rows.push({ probe: `${tier.label} parse`, ok: false, model: tier.modelId, latencyMs: null, usd: null, note: `结构化输出不可用: ${(err as Error).message.slice(0, 100)}` });
    }
  }
}

const jevOk = await probeJev();
if (jevOk) await probeWideChoice();
await probeClaude();
await probeAdapter();

console.log("\nJev Lab 环境检查\n");
console.table(rows.map((r) => ({ ...r, latencyMs: r.latencyMs ?? "-", usd: fmtUsd(r.usd), ok: r.ok ? "✔" : "✘" })));
console.log(`AWS_PROFILE=${process.env.AWS_PROFILE ?? "(default)"} AWS_REGION=${process.env.AWS_REGION ?? "us-east-1"} JEV_CACHE=${process.env.JEV_CACHE ?? "read-write"}`);
const allOk = rows.every((r) => r.ok);
console.log(allOk ? "全部探测通过" : `有 ${rows.filter((r) => !r.ok).length} 项探测失败`);
process.exit(allOk ? 0 : 1);
