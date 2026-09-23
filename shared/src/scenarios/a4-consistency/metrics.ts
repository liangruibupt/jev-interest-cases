import type { Answers, AnyAnswer, Questions } from "../../types";
import { A4_LIMITS, type ArmId } from "./arms";

export interface RunRecord {
  arm: ArmId;
  run: number;
  answers: Answers;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  traceId: string;
  /** LLM adapter diagnostics. */
  degenerate?: string[];
  normalizationDelta?: Record<string, number>;
}

export interface QuestionMetrics {
  questionId: string;
  modalLabel: string;
  /** Share of runs whose top label equals the modal label. */
  rawAgreement: number;
  /** Same, after mapping runs with topProb < uncertainBelow to "uncertain". */
  policyAgreement: number;
  uncertainShare: number;
  /** Mean over options of the std-dev of that option's probability across runs. */
  meanStd: number;
  labelsPerRun: string[];
  topProbPerRun: number[];
}

export interface ArmMetrics {
  arm: ArmId;
  runs: number;
  questions: QuestionMetrics[];
  meanRawAgreement: number;
  meanPolicyAgreement: number;
  meanUncertainShare: number;
  meanStd: number;
  meanLatencyMs: number;
  p50LatencyMs: number;
  totalUsd: number;
  usdPerCall: number;
}

/** The label a run "voted" for, and its probability. Score → argmax level; Noul → yes/no. */
export function topLabel(answer: AnyAnswer): { label: string; prob: number } {
  if (answer.type === "choice") return { label: answer.choice, prob: answer.probabilities[answer.choice] ?? 0 };
  if (answer.type === "score") {
    const entries = Object.entries(answer.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]);
    const best = entries[0] ?? ["0", 0];
    return { label: best[0], prob: best[1] };
  }
  return answer.noul >= 0.5 ? { label: "yes", prob: answer.noul } : { label: "no", prob: 1 - answer.noul };
}

function optionProbabilities(answer: AnyAnswer): Record<string, number> {
  if (answer.type === "noul") return { yes: answer.noul };
  return answer.probabilities as Record<string, number>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const mode = (xs: string[]) => {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};
const p50 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] ?? 0) : 0;
};

export function computeArmMetrics(arm: ArmId, records: RunRecord[], questions: Questions, uncertainBelow: number = A4_LIMITS.uncertainBelow): ArmMetrics {
  const recs = records.filter((r) => r.arm === arm).sort((a, b) => a.run - b.run);
  const qm: QuestionMetrics[] = Object.keys(questions).map((questionId) => {
    const answers = recs.map((r) => r.answers[questionId]).filter((a): a is AnyAnswer => a !== undefined);
    const tops = answers.map(topLabel);
    const labels = tops.map((t) => t.label);
    const probs = tops.map((t) => t.prob);
    const modalLabel = mode(labels);
    const rawAgreement = labels.length ? labels.filter((l) => l === modalLabel).length / labels.length : 0;
    const policyLabels = tops.map((t) => (t.prob < uncertainBelow ? "uncertain" : t.label));
    const policyModal = mode(policyLabels);
    const policyAgreement = policyLabels.length ? policyLabels.filter((l) => l === policyModal).length / policyLabels.length : 0;
    const uncertainShare = policyLabels.length ? policyLabels.filter((l) => l === "uncertain").length / policyLabels.length : 0;
    const optionKeys = new Set(answers.flatMap((a) => Object.keys(optionProbabilities(a))));
    const meanStd = mean([...optionKeys].map((k) => std(answers.map((a) => optionProbabilities(a)[k] ?? 0))));
    return { questionId, modalLabel, rawAgreement, policyAgreement, uncertainShare, meanStd, labelsPerRun: labels, topProbPerRun: probs };
  });
  const latencies = recs.map((r) => r.latencyMs);
  const totalUsd = recs.reduce((s, r) => s + r.costUsd, 0);
  return {
    arm,
    runs: recs.length,
    questions: qm,
    meanRawAgreement: mean(qm.map((q) => q.rawAgreement)),
    meanPolicyAgreement: mean(qm.map((q) => q.policyAgreement)),
    meanUncertainShare: mean(qm.map((q) => q.uncertainShare)),
    meanStd: mean(qm.map((q) => q.meanStd)),
    meanLatencyMs: mean(latencies),
    p50LatencyMs: p50(latencies),
    totalUsd,
    usdPerCall: recs.length ? totalUsd / recs.length : 0,
  };
}

export function ratiosVsJev(all: ArmMetrics[]): Record<ArmId, { latency: number | null; cost: number | null }> {
  const jev = all.find((m) => m.arm === "jev");
  const out = {} as Record<ArmId, { latency: number | null; cost: number | null }>;
  for (const m of all) {
    out[m.arm] = {
      latency: jev && jev.p50LatencyMs > 0 ? m.p50LatencyMs / jev.p50LatencyMs : null,
      cost: jev && jev.usdPerCall > 0 ? m.usdPerCall / jev.usdPerCall : null,
    };
  }
  return out;
}
