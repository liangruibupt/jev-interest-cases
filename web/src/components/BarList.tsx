export interface BarDatum {
  label: string;
  value: number;
  display: string;
  tone: "jev" | "claude";
}

/** Horizontal bars, optional log scale; marks carry the hue, labels stay in ink. */
export function BarList({ title, data, log = false }: { title: string; data: BarDatum[]; log?: boolean }) {
  const vals = data.map((d) => (log ? Math.log10(Math.max(d.value, 1e-9)) : d.value));
  const min = log ? Math.min(...vals) - 0.3 : 0;
  const max = Math.max(...vals, min + 1e-9);
  const width = (v: number) => `${Math.max(2, ((v - min) / (max - min)) * 100)}%`;
  return (
    <div>
      <div className="mb-1 text-xs text-ink-3">
        {title}
        {log && <span className="num ml-1">(log)</span>}
      </div>
      <ul className="space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="grid grid-cols-[9rem_1fr_5rem] items-center gap-2 text-xs" title={`${d.label}: ${d.display}`}>
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="relative h-3 rounded-r-[4px] bg-paper-2">
              <span className={`absolute inset-y-0 left-0 rounded-r-[4px] ${d.tone === "jev" ? "bg-jev" : "bg-claude"}`} style={{ width: width(vals[i] ?? min) }} />
            </span>
            <span className="num text-right text-ink-2">{d.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
