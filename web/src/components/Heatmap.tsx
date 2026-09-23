import type { QuestionMetrics } from "@jev/shared";

/**
 * Rows = questions, columns = runs. Cell colour = the run's top label; a hatched overlay marks
 * runs whose top probability fell below the uncertainty threshold. Text stays in ink tokens.
 */
export function Heatmap({ questions, runs, colors, uncertainBelow, typeById }: { questions: QuestionMetrics[]; runs: number; colors: Record<string, string>; uncertainBelow: number; typeById: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th className="w-40 text-left font-normal text-ink-3">问题</th>
            {Array.from({ length: runs }, (_, i) => (
              <th key={i} className="num font-normal text-ink-3">
                {i + 1}
              </th>
            ))}
            <th className="num w-16 text-right font-normal text-ink-3">一致率</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.questionId}>
              <td className="pr-2 text-ink-2">
                <span className="num mr-1 rounded-sm bg-paper-2 px-1 text-[9px] uppercase text-ink-3">{typeById[q.questionId]}</span>
                {q.questionId}
              </td>
              {Array.from({ length: runs }, (_, i) => {
                const label = q.labelsPerRun[i];
                const p = q.topProbPerRun[i];
                if (label === undefined || p === undefined) return <td key={i} className="h-6 rounded-[3px] bg-paper-2" />;
                const uncertain = p < uncertainBelow;
                return (
                  <td
                    key={i}
                    className="h-6 min-w-6 rounded-[3px]"
                    title={`run ${i + 1}: ${label} p=${p.toFixed(2)}${uncertain ? "（不确定）" : ""}`}
                    style={{
                      backgroundColor: colors[label] ?? "#8a857c",
                      backgroundImage: uncertain ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 6px)" : undefined,
                    }}
                  />
                );
              })}
              <td className="num text-right text-ink-2">{(q.rawAgreement * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend({ colors }: { colors: Record<string, string> }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
      {Object.entries(colors).map(([label, c]) => (
        <li key={label} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ink-3" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 4px)" }} />
        不确定（top p &lt; 门限）
      </li>
    </ul>
  );
}
