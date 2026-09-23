import { BADGE_LABELS_ZH, LANE_LABELS_ZH, type Answers, type Decision, type Ticket } from "@jev/shared";

export function TicketCard({ ticket, answers, decision, selected, onSelect }: { ticket: Ticket; answers: Answers; decision: Decision; selected: boolean; onSelect: () => void }) {
  const dept = answers.department;
  const probs = dept && dept.type === "choice" ? Object.entries(dept.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 2) : [];
  const frustration = answers.frustration;
  const fr = frustration && frustration.type === "score" ? frustration.score : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`hairline rise w-full rounded-md bg-panel p-3 text-left transition-colors hover:border-jev/50 ${selected ? "border-jev ring-1 ring-jev/30" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[10px] text-ink-3">{ticket.id}</span>
        <span className="num text-[10px] text-ink-3" title="优先级">
          P {decision.priority.toFixed(2)}
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-medium" title={ticket.subject}>
        {ticket.subject}
      </div>
      <div className="truncate text-[11px] text-ink-3">{ticket.sender.email}</div>
      <ul className="mt-2 space-y-1">
        {probs.map(([label, p]) => (
          <li key={label} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className="truncate text-ink-2">{LANE_LABELS_ZH[label as keyof typeof LANE_LABELS_ZH] ?? label}</span>
            <span className="relative h-1.5 rounded-r-[3px] bg-paper-2">
              <span className={`absolute inset-y-0 left-0 rounded-r-[3px] ${dept && dept.type === "choice" && label === dept.choice ? "bg-jev" : "bg-rule"}`} style={{ width: `${p * 100}%` }} />
            </span>
            <span className="num text-right text-ink-3">{(p * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="num rounded-sm bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-2" title="frustration score">
          愤怒度 {fr.toFixed(1)}
        </span>
        {decision.badges.map((b) => (
          <span key={b} className={`rounded-sm px-1.5 py-0.5 text-[10px] ${b === "angry" || b === "blocking" ? "bg-bad/10 text-bad" : "bg-jev-soft text-jev"}`}>
            {BADGE_LABELS_ZH[b]}
          </span>
        ))}
        {decision.ccTeams.map((t) => (
          <span key={t} className="rounded-sm border border-rule px-1.5 py-0.5 text-[10px] text-ink-3">
            抄送 {LANE_LABELS_ZH[t]}
          </span>
        ))}
      </div>
    </button>
  );
}
