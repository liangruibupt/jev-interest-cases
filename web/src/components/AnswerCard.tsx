import type { AnyAnswer, Question } from "@jev/shared";
import { useState } from "react";
import { ConfidenceRing } from "./ConfidenceRing";
import { NoulMeter } from "./NoulMeter";
import { ProbBars } from "./ProbBars";
import { ScoreLine } from "./ScoreLine";

export function AnswerCard({ id, question, answer }: { id: string; question: Question; answer: AnyAnswer }) {
  const [showJson, setShowJson] = useState(false);
  const instructions = typeof question.instructions === "string" ? question.instructions : JSON.stringify(question.instructions);
  const badge = answer.type === "choice" ? "bg-jev" : answer.type === "score" ? "bg-ink-2" : "bg-ink-3";
  return (
    <section className="hairline rise rounded-md bg-panel p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white ${badge}`}>{answer.type}</span>
            <span className="num text-xs text-ink-3">{id}</span>
          </div>
          <p className="mt-1 text-sm text-ink-2">{instructions}</p>
        </div>
        {answer.type !== "noul" && <ConfidenceRing value={answer.confidence} />}
      </header>
      <div className="mt-3">
        {answer.type === "choice" && (
          <>
            <div className="mb-2 text-sm">
              选中：<span className="font-medium">{answer.choice}</span>
            </div>
            <ProbBars probabilities={answer.probabilities} chosen={answer.choice} />
          </>
        )}
        {answer.type === "score" && (
          <ScoreLine score={answer.score} legend={answer.legend as Record<string, unknown>} probabilities={answer.probabilities as Record<string, number>} />
        )}
        {answer.type === "noul" && <NoulMeter value={answer.noul} />}
      </div>
      <button type="button" className="mt-3 text-[11px] text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink" onClick={() => setShowJson(!showJson)}>
        {showJson ? "收起返回 JSON" : "查看返回 JSON"}
      </button>
      {showJson && <pre className="num mt-2 max-h-56 overflow-auto rounded-sm bg-ink p-3 text-[11px] leading-snug text-paper">{JSON.stringify(answer, null, 2)}</pre>}
    </section>
  );
}
