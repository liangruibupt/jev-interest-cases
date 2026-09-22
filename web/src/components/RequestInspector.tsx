import type { Trace } from "@jev/shared";
import { useState } from "react";
import { zh } from "../i18n/zh";
import { fmtUsd } from "../lib/format";
import { LatencyChip } from "./LatencyChip";

export function RequestInspector({ traces }: { traces: Trace[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="hairline rounded-md bg-panel">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="font-display text-sm">{zh.inspector.title}</span>
        <span className="num text-[11px] text-ink-3">{traces.length}</span>
      </div>
      {traces.length === 0 ? (
        <div className="px-4 py-4 text-sm text-ink-3">{zh.inspector.empty}</div>
      ) : (
        <ul className="divide-y divide-rule">
          {traces.map((t) => (
            <li key={t.id} className="px-4 py-2 text-sm">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-white ${t.kind === "jev" ? "bg-jev" : "bg-claude"}`}>
                  {t.kind === "jev" ? "Jev" : "Claude"}
                </span>
                <span className="num text-xs text-ink-2">{t.model}</span>
                {t.kind === "claude" && <span className="text-xs text-ink-3">{t.purpose}</span>}
                <LatencyChip ms={t.latencyMs} cached={t.kind === "jev" && t.cached} kind={t.kind} />
                <span className="num text-xs text-ink-3">{t.kind === "jev" ? `${t.response.usage.input_tokens} tok` : `${t.inputTokens}+${t.outputTokens} tok`}</span>
                <span className="num ml-auto text-xs">{fmtUsd(t.cost.usd)}</span>
              </button>
              {open === t.id && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <Json title={zh.inspector.request} value={t.kind === "jev" ? t.request : { tier: t.tier, model: t.model, purpose: t.purpose }} />
                  <Json
                    title={zh.inspector.response}
                    value={t.kind === "jev" ? t.response : { stopReason: t.stopReason, inputTokens: t.inputTokens, outputTokens: t.outputTokens }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-3">
        <span>{title}</span>
        <button type="button" className="hover:text-ink" onClick={() => void navigator.clipboard.writeText(text)}>
          {zh.inspector.copy}
        </button>
      </div>
      <pre className="num max-h-80 overflow-auto rounded-sm bg-ink p-3 text-[11px] leading-snug text-paper">{text}</pre>
    </div>
  );
}
