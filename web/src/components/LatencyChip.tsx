import { fmtMs } from "../lib/format";

export function LatencyChip({ ms, cached = false, kind = "jev" }: { ms: number; cached?: boolean; kind?: "jev" | "claude" }) {
  const tone = kind === "jev" ? "bg-jev-soft text-jev" : "bg-claude-soft text-claude";
  return (
    <span className={`num inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] ${cached ? "bg-paper-2 text-ink-3" : tone}`}>
      {cached ? "缓存" : fmtMs(ms)}
    </span>
  );
}
