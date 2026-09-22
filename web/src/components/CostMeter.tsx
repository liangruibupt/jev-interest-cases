import { zh } from "../i18n/zh";
import { fmtMs, fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

export function CostMeter() {
  const { totals, reset } = useSession();
  return (
    <div className="flex items-center gap-5 text-xs">
      <span className="text-ink-3">{zh.cost.title}</span>
      <Stat
        label={zh.cost.jev}
        value={fmtUsd(totals.jevUsd)}
        sub={`${totals.jevCalls} ${zh.cost.calls} · ${totals.jevCached} ${zh.cost.cached} · ${fmtMs(totals.avgJevLatencyMs)}`}
        tone="jev"
      />
      <Stat label={zh.cost.claude} value={fmtUsd(totals.claudeUsd)} sub={`${totals.claudeCalls} ${zh.cost.calls} · ${fmtMs(totals.avgClaudeLatencyMs)}`} tone="claude" />
      <button type="button" onClick={reset} className="hairline rounded-sm px-2 py-1 text-ink-3 hover:bg-paper-2">
        {zh.cost.reset}
      </button>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "jev" | "claude" }) {
  return (
    <div className="text-right leading-tight">
      <div className={`num text-sm ${tone === "jev" ? "text-jev" : "text-claude"}`}>{value}</div>
      <div className="text-[10px] text-ink-3">
        {label} · {sub}
      </div>
    </div>
  );
}
