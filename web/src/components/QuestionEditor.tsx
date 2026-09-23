import type { Question, Questions } from "@jev/shared";
import { useState } from "react";
import { zh } from "../i18n/zh";

type Kind = Question["type"];

interface Row {
  key: number;
  id: string;
  type: Kind;
  instructions: string;
  criteria: string;
  error?: string;
}

const toText = (v: unknown): string => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

function rowsFrom(questions: Questions): Row[] {
  return Object.entries(questions).map(([id, q], i) => ({
    key: i,
    id,
    type: q.type,
    instructions: toText(q.instructions),
    criteria: "criteria" in q && q.criteria !== undefined && q.criteria !== null ? JSON.stringify(q.criteria, null, 2) : "",
  }));
}

function parseInstructions(text: string): unknown {
  const t = text.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  }
  return text;
}

function rowToQuestion(row: Row): { question?: Question; error?: string } {
  const instructions = parseInstructions(row.instructions);
  const crit = row.criteria.trim();
  try {
    if (row.type === "noul") {
      const q: Question = crit ? { type: "noul", instructions: instructions as never, criteria: JSON.parse(crit) } : { type: "noul", instructions: instructions as never };
      return { question: q };
    }
    if (!crit) return { error: "criteria 不能为空" };
    const parsed = JSON.parse(crit);
    if (row.type === "choice") {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Choice 的 criteria 必须是对象 { 选项: 描述 }" };
      return { question: { type: "choice", instructions: instructions as never, criteria: parsed } };
    }
    if (!Array.isArray(parsed)) return { error: "Score 的 criteria 必须是数组 [等级描述…]" };
    return { question: { type: "score", instructions: instructions as never, criteria: parsed as never } };
  } catch {
    return { error: zh.a1.invalidJson };
  }
}

export function QuestionEditor({ initial, onChange }: { initial: Questions; onChange: (q: Questions | null, errors: string[]) => void }) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(initial));

  function commit(next: Row[]) {
    const questions: Questions = {};
    const errors: string[] = [];
    const seen = new Set<string>();
    const annotated = next.map((r) => {
      const id = r.id.trim();
      if (!id) {
        errors.push("ID 不能为空");
        return { ...r, error: "ID 不能为空" };
      }
      if (seen.has(id)) {
        errors.push(`ID 重复：${id}`);
        return { ...r, error: "ID 重复" };
      }
      seen.add(id);
      const { question, error } = rowToQuestion(r);
      if (error || !question) {
        errors.push(`${id}: ${error ?? "无效"}`);
        return { ...r, error };
      }
      questions[id] = question;
      return { ...r, error: undefined };
    });
    setRows(annotated);
    onChange(errors.length ? null : questions, errors);
  }

  const update = (key: number, patch: Partial<Row>) => commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => commit(rows.filter((r) => r.key !== key));
  const add = () => {
    const nextKey = (rows.at(-1)?.key ?? -1) + 1;
    commit([...rows, { key: nextKey, id: `q${rows.length + 1}`, type: "noul", instructions: "", criteria: "" }]);
  };

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className={`hairline rounded-md bg-panel p-3 ${r.error ? "border-bad/60" : ""}`}>
          <div className="flex items-center gap-2">
            <input
              className="hairline num w-40 rounded-sm bg-paper px-2 py-1 text-xs"
              value={r.id}
              onChange={(e) => update(r.key, { id: e.target.value })}
              aria-label={zh.a1.id}
            />
            <select className="hairline rounded-sm bg-paper px-2 py-1 text-xs" value={r.type} onChange={(e) => update(r.key, { type: e.target.value as Kind })} aria-label={zh.a1.type}>
              <option value="choice">choice</option>
              <option value="score">score</option>
              <option value="noul">noul</option>
            </select>
            <button type="button" className="ml-auto text-[11px] text-ink-3 hover:text-bad" onClick={() => remove(r.key)}>
              {zh.a1.remove}
            </button>
          </div>
          <label className="mt-2 block text-[11px] text-ink-3">{zh.a1.instructions}</label>
          <textarea
            className="hairline mt-1 w-full rounded-sm bg-paper px-2 py-1 font-mono text-xs leading-snug"
            rows={2}
            value={r.instructions}
            onChange={(e) => update(r.key, { instructions: e.target.value })}
          />
          <label className="mt-2 block text-[11px] text-ink-3">
            {zh.a1.criteria}
            {r.type === "noul" && <span className="ml-2 text-ink-3/70">{zh.a1.criteriaNoulHint}</span>}
          </label>
          <textarea
            className="hairline mt-1 w-full rounded-sm bg-paper px-2 py-1 font-mono text-xs leading-snug"
            rows={r.type === "noul" ? 1 : 3}
            value={r.criteria}
            onChange={(e) => update(r.key, { criteria: e.target.value })}
          />
          {r.error && <div className="mt-1 text-[11px] text-bad">{r.error}</div>}
        </div>
      ))}
      <button type="button" className="hairline w-full rounded-md bg-panel py-1.5 text-xs text-ink-2 hover:bg-paper-2" onClick={add}>
        + {zh.a1.addQuestion}
      </button>
    </div>
  );
}
