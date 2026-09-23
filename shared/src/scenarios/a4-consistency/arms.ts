import { CLAUDE_TIERS, claudeCostUsd, jevCostUsd, type ClaudeTierId } from "../../pricing";
import type { A4CaseId } from "./cases";

export type ArmId = "jev" | "sonnet46_t0" | "sonnet46" | "sonnet5" | "opus5" | "fable51" | "haiku45";

export interface Arm {
  id: ArmId;
  label: string;
  kind: "jev" | "llm";
  tier?: ClaudeTierId;
  temperature?: number;
  enabledByDefault: boolean;
  note_zh: string;
}

export const A4_ARMS: Arm[] = [
  { id: "jev", label: "Jev (jev-latest)", kind: "jev", enabledByDefault: true, note_zh: "缓存关闭，每轮真实请求" },
  { id: "sonnet46_t0", label: "Claude Sonnet 4.6 · t=0", kind: "llm", tier: "prev_sonnet", temperature: 0, enabledByDefault: true, note_zh: "LLM 最稳的设置：方差低不等于校准好" },
  { id: "sonnet46", label: "Claude Sonnet 4.6 · 默认采样", kind: "llm", tier: "prev_sonnet", enabledByDefault: true, note_zh: "上一代模型的默认行为" },
  { id: "sonnet5", label: "Claude Sonnet 5", kind: "llm", tier: "standard", enabledByDefault: true, note_zh: "5 系列不支持 temperature" },
  { id: "opus5", label: "Claude Opus 5", kind: "llm", tier: "strong", enabledByDefault: true, note_zh: "最强主力模型，自适应思考默认开启" },
  { id: "fable51", label: "Claude Fable 5.1", kind: "llm", tier: "frontier", enabledByDefault: false, note_zh: "可选：前沿层，费用最高" },
  { id: "haiku45", label: "Claude Haiku 4.5", kind: "llm", tier: "haiku", enabledByDefault: false, note_zh: "可选：复现官方 cookbook 的 Haiku 数字" },
];

export const A4_LIMITS = { minRuns: 3, maxRuns: 15, maxArms: 6, uncertainBelow: 0.6 } as const;

/** Token assumptions for the pre-run estimate; the page shows actuals afterwards. */
const ASSUMED = { jevInput: 1200, llmInput: 1400, llmOutput: 300 } as const;

export function estimateRunCost(_caseId: A4CaseId, arms: ArmId[], runs: number): { usd: number; perArm: Partial<Record<ArmId, number>> } {
  const perArm: Partial<Record<ArmId, number>> = {};
  let usd = 0;
  for (const id of arms) {
    const arm = A4_ARMS.find((a) => a.id === id);
    if (!arm) continue;
    const perCall = arm.kind === "jev" ? jevCostUsd(ASSUMED.jevInput) : claudeCostUsd(arm.tier!, ASSUMED.llmInput, ASSUMED.llmOutput);
    perArm[id] = perCall * runs;
    usd += perCall * runs;
  }
  return { usd, perArm };
}

export const armLabel = (id: ArmId): string => A4_ARMS.find((a) => a.id === id)?.label ?? id;
export const armTierLabel = (id: ArmId): string => {
  const a = A4_ARMS.find((x) => x.id === id);
  return a?.tier ? CLAUDE_TIERS[a.tier].label : "Jev";
};
