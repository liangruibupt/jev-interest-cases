import { GITHUB_TOS_LINES } from "../../datasets/githubTos";

export const A3_LINES: readonly string[] = GITHUB_TOS_LINES;

export const lineId = (i: number): string => `L${String(i).padStart(3, "0")}`;

/** The whole document, one tagged line per row, sent as the state of every search request (≈ 12k tokens). */
export function buildDocumentState(lines: readonly string[] = A3_LINES): string {
  return lines.map((l, i) => `${lineId(i)}| ${l}`).join("\n");
}
