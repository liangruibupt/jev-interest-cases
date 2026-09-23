/** Choice distribution: single Jev hue with emphasis on the chosen option; values in ink. */
export function ProbBars({ probabilities, chosen }: { probabilities: Record<string, number>; chosen?: string }) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, p]) => (
        <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm" title={`${label}: ${(p * 100).toFixed(1)}%`}>
          <span className={`truncate ${label === chosen ? "font-medium text-ink" : "text-ink-2"}`}>{label}</span>
          <span className="relative h-3 rounded-r-[4px] bg-paper-2">
            <span
              className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300 ${label === chosen ? "bg-jev" : "bg-rule"}`}
              style={{ width: `${Math.max(0, Math.min(100, p * 100))}%` }}
            />
          </span>
          <span className="num text-right text-xs text-ink-2">{(p * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}
