import type { Questions } from "../../types";
import { A3_LINES, lineId } from "./buildState";

/**
 * One Choice over every line id (relevance), one Noul for "does the document answer this at all"
 * (a Choice always sums to 1, so it will always name some line), and one speculative Noul.
 */
export function buildFindQuestions(query: string, lineCount: number = A3_LINES.length): Questions {
  const q = query.replace(/\s+/g, " ").trim().replace(/"/g, "'");
  return {
    where: {
      type: "choice",
      instructions: `Which line of the document contains the answer to: "${q}"?`,
      criteria: Object.fromEntries(Array.from({ length: lineCount }, (_, i) => [lineId(i), null])),
    },
    exists: {
      type: "noul",
      instructions: `Does any line of the document address or answer: "${q}"?`,
      criteria: {
        true: "At least one line states or directly implies the answer",
        false: "No line addresses this question",
      },
    },
    spans_multiple: {
      type: "noul",
      instructions: `Is the answer to "${q}" spread across more than one line of the document?`,
    },
  };
}

/**
 * `expect` lists the statuses we accept for the query. Both cookbook "edge" queries sit near a
 * threshold: the arbitration query has no answer in the document but the document does talk about
 * dispute venue (exists measured 0.34 and 0.40 on two runs), and the minors query is answered only
 * partially (age 13, nothing about parental permission; exists 0.77).
 */
export const A3_PRESET_QUERIES: { query: string; note_zh: string; expect: readonly ("answered" | "partial" | "absent")[] }[] = [
  { query: "who owns the code I upload?", note_zh: "cookbook 示例：明确有答案（L052）", expect: ["answered"] },
  { query: "can GitHub kick me off the platform without warning?", note_zh: "cookbook 示例：终止条款", expect: ["answered"] },
  { query: "do I have to take disputes to arbitration?", note_zh: "cookbook 示例：文档没有仲裁条款——看 exists（贴近门限）", expect: ["absent", "partial"] },
  { query: "can minors use GitHub with parental permission?", note_zh: "cookbook 示例：只回答了年龄，没提家长许可", expect: ["answered", "partial"] },
  { query: "can I use GitHub for cryptocurrency mining?", note_zh: "附加：可接受使用（文档只泛泛说不得违法）", expect: ["absent", "partial", "answered"] },
  { query: "what happens to my data if I delete my account?", note_zh: "附加：账户取消后的数据保留", expect: ["answered", "partial"] },
];
