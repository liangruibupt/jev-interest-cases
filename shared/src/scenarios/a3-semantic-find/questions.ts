import type { Questions } from "../../types";
import { A3_LINES, lineId } from "./buildState";

/**
 * One Choice over every line id (relevance), one Noul for "does the document answer this at all"
 * (a Choice always sums to 1, so it will always name some line), and one speculative Noul.
 */
export function buildFindQuestions(query: string, lineCount: number = A3_LINES.length): Questions {
  const q = query.trim().replace(/"/g, "'");
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

export const A3_PRESET_QUERIES: { query: string; note_zh: string; expect: "answered" | "partial" | "absent" | "any" }[] = [
  { query: "who owns the code I upload?", note_zh: "cookbook 示例：明确有答案", expect: "answered" },
  { query: "can GitHub kick me off the platform without warning?", note_zh: "cookbook 示例：终止条款", expect: "answered" },
  { query: "do I have to take disputes to arbitration?", note_zh: "cookbook 示例：文档没有仲裁条款——看 exists", expect: "absent" },
  { query: "can minors use GitHub with parental permission?", note_zh: "cookbook 示例：只部分涉及", expect: "partial" },
  { query: "can I use GitHub for cryptocurrency mining?", note_zh: "附加：可接受使用", expect: "any" },
  { query: "what happens to my data if I delete my account?", note_zh: "附加：账户取消", expect: "any" },
];
