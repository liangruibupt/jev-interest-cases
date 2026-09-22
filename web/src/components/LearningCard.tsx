import { zh } from "../i18n/zh";

export function LearningCard({ title, proves, tryThis, pitfalls }: { title?: string; proves: string[]; tryThis: string[]; pitfalls: string[] }) {
  return (
    <aside className="rounded-md border border-jev/20 bg-jev-soft/40 p-4 text-sm">
      <div className="font-display text-jev">{title ?? zh.learning.title}</div>
      <Block heading={zh.learning.proves} items={proves} />
      <Block heading={zh.learning.tryThis} items={tryThis} />
      <Block heading={zh.learning.pitfalls} items={pitfalls} />
    </aside>
  );
}

function Block({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-jev/80">{heading}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
