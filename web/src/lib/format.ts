export const fmtUsd = (n: number): string => (n === 0 ? "$0" : n < 0.001 ? `$${n.toFixed(6)}` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
export const fmtMs = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
export const fmtPct = (n: number): string => `${n.toFixed(n >= 99 ? 2 : 1)}%`;
export const fmtRatio = (n: number | null): string => (n === null ? "—" : n >= 100 ? `${Math.round(n)}×` : `${n.toFixed(1)}×`);
