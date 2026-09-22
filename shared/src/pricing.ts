/** Jev (TypeSafe) list price: charged per input token, output free. Source: https://docs.typesafe.ai/models */
export const JEV_USD_PER_MTOK_INPUT = 0.042;
export const JEV_USD_PER_MTOK_OUTPUT = 0;

export type ClaudeTierId = "standard" | "strong" | "prev_sonnet" | "prev_opus" | "frontier" | "haiku";

export interface ClaudeTier {
  id: ClaudeTierId;
  /** Bedrock inference-profile ID (runtime endpoint). */
  modelId: string;
  label: string;
  inUsdPerMtok: number;
  outUsdPerMtok: number;
  /** Claude 4.6 family accepts `temperature`; the 5 family rejects it (400). */
  supportsTemperature: boolean;
  /** `output_config.effort` supported (all 4.6+ models; not Haiku 4.5). */
  supportsEffort: boolean;
  enabledByDefault: boolean;
  role_zh: string;
}

/** Single source of truth for Claude model IDs and list prices ($ per 1M tokens). */
export const CLAUDE_TIERS: Record<ClaudeTierId, ClaudeTier> = {
  standard: {
    id: "standard",
    modelId: "global.anthropic.claude-sonnet-5",
    label: "Claude Sonnet 5",
    inUsdPerMtok: 2,
    outUsdPerMtok: 10,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "默认生成模型；B1 中档；B4 拆分与闲聊",
  },
  strong: {
    id: "strong",
    modelId: "global.anthropic.claude-opus-5",
    label: "Claude Opus 5",
    inUsdPerMtok: 5,
    outUsdPerMtok: 25,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "高复杂度路由；B2/B3 可选生成层；A4 对照",
  },
  prev_sonnet: {
    id: "prev_sonnet",
    modelId: "global.anthropic.claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    inUsdPerMtok: 3,
    outUsdPerMtok: 15,
    supportsTemperature: true,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "上一代对照（可设 temperature）",
  },
  prev_opus: {
    id: "prev_opus",
    modelId: "global.anthropic.claude-opus-4-6-v1",
    label: "Claude Opus 4.6",
    inUsdPerMtok: 5,
    outUsdPerMtok: 25,
    supportsTemperature: true,
    supportsEffort: true,
    enabledByDefault: false,
    role_zh: "上一代对照（可选）",
  },
  frontier: {
    id: "frontier",
    modelId: "global.anthropic.claude-fable-5-1",
    label: "Claude Fable 5.1",
    inUsdPerMtok: 10,
    outUsdPerMtok: 50,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: false,
    role_zh: "可选前沿层；成本基线上限",
  },
  haiku: {
    id: "haiku",
    modelId: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "Claude Haiku 4.5",
    inUsdPerMtok: 1,
    outUsdPerMtok: 5,
    supportsTemperature: true,
    supportsEffort: false,
    enabledByDefault: false,
    role_zh: "仅用于复现官方 cookbook 数字",
  },
};

export const CLAUDE_TIER_IDS = Object.keys(CLAUDE_TIERS) as ClaudeTierId[];

export function jevCostUsd(inputTokens: number, outputTokens = 0): number {
  return (inputTokens / 1e6) * JEV_USD_PER_MTOK_INPUT + (outputTokens / 1e6) * JEV_USD_PER_MTOK_OUTPUT;
}

export function claudeCostUsd(tier: ClaudeTierId, inputTokens: number, outputTokens: number): number {
  const t = CLAUDE_TIERS[tier];
  return (inputTokens / 1e6) * t.inUsdPerMtok + (outputTokens / 1e6) * t.outUsdPerMtok;
}
