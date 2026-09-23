/** Noul: a meter (Jev fill on a lighter Jev track) with hairline zone markers for the NO / YES thresholds. */
export function NoulMeter({ value, no = 0.2, yes = 0.8 }: { value: number; no?: number; yes?: number }) {
  const zone = value >= yes ? "是" : value <= no ? "否" : "不确定";
  return (
    <div title={`noul = ${value.toFixed(3)}`}>
      <div className="flex items-baseline justify-between">
        <span className="num text-2xl text-ink">{value.toFixed(2)}</span>
        <span className="text-xs text-ink-2">
          {zone}（NO ≤ {no} · YES ≥ {yes}）
        </span>
      </div>
      <div className="relative mt-2 h-3 rounded-[4px] bg-jev-soft">
        <div className="absolute inset-y-0 left-0 rounded-[4px] bg-jev transition-[width] duration-300" style={{ width: `${value * 100}%` }} />
        <div className="absolute -top-1 h-5 w-px bg-ink-3" style={{ left: `${no * 100}%` }} />
        <div className="absolute -top-1 h-5 w-px bg-ink-3" style={{ left: `${yes * 100}%` }} />
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-ink-3">
        <span>0 否</span>
        <span>0.5</span>
        <span>是 1</span>
      </div>
    </div>
  );
}
