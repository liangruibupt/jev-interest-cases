export function ConfidenceRing({ value }: { value: number | null }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="flex shrink-0 items-center gap-2" title={value === null ? "LLM 适配器不提供 confidence" : `confidence = ${v.toFixed(3)}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-jev)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <div className="leading-tight">
        <div className="num text-sm text-ink">{value === null ? "—" : v.toFixed(2)}</div>
        <div className="text-[10px] text-ink-3">confidence</div>
      </div>
    </div>
  );
}
