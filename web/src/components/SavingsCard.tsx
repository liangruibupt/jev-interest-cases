import { CLAUDE_TIERS, CLAUDE_TIER_IDS, estimateLlmBaseline, type ClaudeTierId, type JevTrace, type ScenarioId } from "@jev/shared";
import { useMemo, useState } from "react";
import { zh } from "../i18n/zh";
import { fmtPct, fmtRatio, fmtUsd } from "../lib/format";

export function SavingsCard({ scenario, jevTraces, defaultTier = "standard" }: { scenario: ScenarioId; jevTraces: JevTrace[]; defaultTier?: ClaudeTierId }) {
  const [tier, setTier] = useState<ClaudeTierId>(defaultTier);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const est = useMemo(() => estimateLlmBaseline(scenario, jevTraces, tier), [scenario, jevTraces, tier]);
  return (
    <section className="hairline rounded-md bg-panel p-4">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm">{zh.savings.title}</div>
        <select className="hairline num rounded-sm bg-paper px-2 py-1 text-xs" value={tier} onChange={(e) => setTier(e.target.value as ClaudeTierId)}>
          {CLAUDE_TIER_IDS.map((id) => (
            <option key={id} value={id}>
              {CLAUDE_TIERS[id].label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <Figure value={fmtUsd(est.llmUsd)} label={zh.savings.baseline} tone="text-claude" />
        <Figure value={fmtUsd(est.jevUsd)} label={zh.savings.actual} tone="text-jev" />
        <Figure value={est.calls ? `${fmtPct(est.savingsPct)} · ${fmtRatio(est.ratio)}` : zh.savings.empty} label={zh.savings.savings} tone="text-ok" />
      </div>
      <button type="button" className="mt-3 text-xs text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink" onClick={() => setShowAssumptions(!showAssumptions)}>
        {showAssumptions ? zh.savings.hideAssumptions : zh.savings.assumptions}
      </button>
      {showAssumptions && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-ink-2">
          <dt className="text-ink-3">{zh.savings.tier}</dt>
          <dd>
            {est.tierLabel}（${CLAUDE_TIERS[tier].inUsdPerMtok} / ${CLAUDE_TIERS[tier].outUsdPerMtok} 每 Mtok 输入/输出）
          </dd>
          <dt className="text-ink-3">{zh.savings.calls}</dt>
          <dd className="num">{est.calls}</dd>
          <dt className="text-ink-3">{zh.savings.tokens}</dt>
          <dd className="num">{est.inputTokens}（与发给 Jev 的完全相同）</dd>
          <dt className="text-ink-3">{zh.savings.perCallOut}</dt>
          <dd className="num">{est.assumption.outputTokensPerCall}</dd>
          <dt className="text-ink-3">{zh.savings.replaced}</dt>
          <dd>{est.assumption.title_zh}</dd>
          <dt className="text-ink-3">{zh.savings.note}</dt>
          <dd>{est.assumption.note_zh}</dd>
        </dl>
      )}
    </section>
  );
}

function Figure({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div>
      <div className={`num text-lg ${tone}`}>{value}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}
