/** `npm run warm-cache` — evaluates every demo input once in normal mode so server/.cache/jev can be committed and replayed without a key. */
import { A1_PRESETS, A2_QUESTIONS, TICKETS, buildTicketState } from "../shared/src/index";
import { askJev } from "../server/src/lib/jev";

let calls = 0;
let cached = 0;
let usd = 0;
const note = (label: string, t: { cached: boolean; cost: { usd: number } }) => {
  calls += 1;
  if (t.cached) cached += 1;
  usd += t.cost.usd;
  console.log(`${t.cached ? "cached " : "fetched"} ${label}`);
};

for (const p of A1_PRESETS) {
  const { trace } = await askJev({ scenario: "a1", state: p.state, questions: p.questions }, { cache: "read-write" });
  note(`a1/${p.id}`, trace);
}
const a2 = await Promise.all(TICKETS.map((t) => askJev({ scenario: "a2", state: buildTicketState(t), questions: A2_QUESTIONS }, { cache: "read-write" })));
a2.forEach((o, i) => note(`a2/${TICKETS[i]!.id}`, o.trace));

console.log(`\n${calls} inputs, ${cached} already cached, ${calls - cached} fetched, spent $${usd.toFixed(6)}`);
