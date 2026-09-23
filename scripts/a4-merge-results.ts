/**
 * `npm run a4:merge -- <target.json> <source.json>` — copies the records of arms present in <source>
 * into <target> (replacing that arm's records), so a re-run of one arm can be merged into a saved experiment.
 */
import { readFile, writeFile } from "node:fs/promises";

const [target, source] = process.argv.slice(2);
if (!target || !source) {
  console.error("usage: a4-merge-results <target.json> <source.json>");
  process.exit(1);
}
type Result = { caseId: string; runs: number; arms: string[]; records: { arm: string }[] };
const t = JSON.parse(await readFile(target, "utf8")) as Result;
const s = JSON.parse(await readFile(source, "utf8")) as Result;
if (t.caseId !== s.caseId) throw new Error(`case mismatch: ${t.caseId} vs ${s.caseId}`);
const armsFromSource = new Set(s.records.map((r) => r.arm));
t.records = [...t.records.filter((r) => !armsFromSource.has(r.arm)), ...s.records];
t.arms = [...new Set([...t.arms, ...s.arms])];
await writeFile(target, JSON.stringify(t, null, 2));
console.log(`merged arms ${[...armsFromSource].join(", ")} into ${target} (${t.records.length} records)`);
