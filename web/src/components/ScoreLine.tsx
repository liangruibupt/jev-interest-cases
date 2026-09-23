/** Score: one bar per level (argmax emphasized) plus the expected value on a 0..n-1 number line. */
export function ScoreLine({ score, legend, probabilities }: { score: number; legend: Record<string, unknown>; probabilities: Record<string, number> }) {
  const levels = Object.keys(legend)
    .map(Number)
    .sort((a, b) => a - b);
  const top = levels.length - 1;
  const argmax = levels.reduce((a, b) => ((probabilities[String(a)] ?? 0) >= (probabilities[String(b)] ?? 0) ? a : b));
  const describe = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const pct = (lv: number) => `${(lv / Math.max(top, 1)) * 100}%`;
  return (
    <div>
      <ul className="space-y-1.5">
        {levels.map((lv) => {
          const p = probabilities[String(lv)] ?? 0;
          return (
            <li key={lv} className="grid grid-cols-[1.25rem_minmax(0,1fr)_6rem_3.5rem] items-center gap-3 text-sm" title={`${lv}: ${(p * 100).toFixed(1)}%`}>
              <span className="num text-xs text-ink-3">{lv}</span>
              <span className={`truncate ${lv === argmax ? "text-ink" : "text-ink-2"}`}>{describe(legend[String(lv)])}</span>
              <span className="relative h-3 rounded-r-[4px] bg-paper-2">
                <span className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300 ${lv === argmax ? "bg-jev" : "bg-rule"}`} style={{ width: `${p * 100}%` }} />
              </span>
              <span className="num text-right text-xs text-ink-2">{(p * 100).toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 px-1">
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-3 h-px bg-rule" />
          {levels.map((lv) => (
            <div key={lv} className="absolute top-2 h-3 w-px bg-rule" style={{ left: pct(lv) }} />
          ))}
          <div className="absolute top-1 h-5 w-0.5 -translate-x-1/2 bg-jev" style={{ left: pct(score) }} title={`score = ${score.toFixed(2)}`} />
        </div>
        <div className="num flex justify-between text-[10px] text-ink-3">
          <span>0</span>
          <span>score = {score.toFixed(2)}</span>
          <span>{top}</span>
        </div>
      </div>
    </div>
  );
}
