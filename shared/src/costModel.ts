import { CLAUDE_TIERS, claudeCostUsd, jevCostUsd, type ClaudeTierId } from "./pricing";
import type { BaselineEstimate, JevTrace, ScenarioId } from "./types";

export interface BaselineAssumption {
  /** What LLM work the Jev call replaces. */
  title_zh: string;
  /** Output tokens an LLM would have to generate per Jev call (JSON answers, a line number, a verdict...). */
  outputTokensPerCall: number;
  note_zh: string;
}

/**
 * Per-scenario assumptions for the "if we had used an LLM" baseline. Input tokens are taken
 * from the real Jev request (same state + same questions); output tokens are these constants.
 * All numbers are shown in the UI next to the estimate.
 */
export const BASELINE_ASSUMPTIONS: Record<ScenarioId, BaselineAssumption> = {
  p0: { title_zh: "LLM 结构化输出回答同一问题", outputTokensPerCall: 100, note_zh: "环境检查用" },
  a1: { title_zh: "LLM 结构化输出回答同一组问题", outputTokensPerCall: 150, note_zh: "3 题 JSON 约 150 tokens" },
  a2: { title_zh: "LLM 一次 JSON 分类 10 个字段", outputTokensPerCall: 250, note_zh: "10 个字段的 JSON 约 250 tokens；改阈值时 LLM 需全部重跑" },
  a3: { title_zh: "LLM 读全文并指出行号", outputTokensPerCall: 100, note_zh: "对比向量检索时 Jev 并不更便宜；优势是零索引与可解释" },
  a4: { title_zh: "LLM 结构化输出 8 个概率分布", outputTokensPerCall: 300, note_zh: "此场景另有实测数字" },
  b1: { title_zh: "LLM 做意图与护栏分类", outputTokensPerCall: 200, note_zh: "只算分类步骤；端到端节省另见 B1 页面双基线" },
  b2: { title_zh: "同一 LLM 逐条核验引用", outputTokensPerCall: 60, note_zh: "只算核验步骤；生成步骤两边相同" },
  b3: { title_zh: "LLM 逐段判定 4 项", outputTokensPerCall: 80, note_zh: "只算守门步骤；端到端还节省了生成阶段的输入 tokens" },
  b4: { title_zh: "LLM function calling 一次", outputTokensPerCall: 120, note_zh: "纯设备指令；复合/闲聊指令另加一次 Sonnet 5" },
};

export function estimateLlmBaseline(
  scenario: ScenarioId,
  jevTraces: readonly JevTrace[],
  tier: ClaudeTierId = "standard",
): BaselineEstimate {
  const assumption = BASELINE_ASSUMPTIONS[scenario];
  const calls = jevTraces.length;
  const inputTokens = jevTraces.reduce((sum, t) => sum + t.response.usage.input_tokens, 0);
  const outputTokens = calls * assumption.outputTokensPerCall;
  const llmUsd = claudeCostUsd(tier, inputTokens, outputTokens);
  const jevUsd = jevCostUsd(inputTokens);
  const ratio = jevUsd > 0 ? llmUsd / jevUsd : null;
  const savingsPct = llmUsd > 0 ? (1 - jevUsd / llmUsd) * 100 : 0;
  return {
    scenario,
    tier,
    tierLabel: CLAUDE_TIERS[tier].label,
    calls,
    inputTokens,
    outputTokens,
    llmUsd,
    jevUsd,
    ratio,
    savingsPct,
    assumption,
  };
}
