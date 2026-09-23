// English-only: CJK text has no ASCII sentence terminators and counts as 0. `etc.`/`No.` are deliberately not
// treated as abbreviations because they usually do end a sentence.
const ABBREVIATIONS = /\b(e\.g|i\.e|vs|dr|mr|mrs|ms|prof|st)\.$/i;

/** Sentence count in code — Jev is never asked to count. Splits on . ! ? followed by whitespace, ignoring common abbreviations. */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/(?<=[.!?]["'”’)]*)\s+/);
  const merged: string[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && ABBREVIATIONS.test(prev)) merged[merged.length - 1] = `${prev} ${p}`;
    else merged.push(p);
  }
  return merged.filter((s) => /[A-Za-z0-9]/.test(s)).length;
}
