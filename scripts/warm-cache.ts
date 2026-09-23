/** `npm run warm-cache` — evaluates every demo input once in normal mode so server/.cache/jev can be committed and replayed without a key. */
import { A1_PRESETS, A2_QUESTIONS, A3_PRESET_QUERIES, B1_QUESTIONS, B2_QUESTIONS, B3_PRESET_QUERIES, B3_QUESTIONS, C1_QUESTIONS, CORPUS, ESSAYS, EXAMPLE_REQUESTS, INITIAL_HOME, ROOMS, CANNED_CITATIONS, GUARDRAIL_MESSAGES, RFC_SECTIONS, TICKETS, buildClaimState, buildDocumentState, buildFindQuestions, bm25Search, buildB4Questions, buildEssayState, buildIndex, buildMessageState, buildPassageState, buildRequestState, buildTicketState, passageById, stringStage } from "../shared/src/index";
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
const b1 = await Promise.all(GUARDRAIL_MESSAGES.map((m) => askJev({ scenario: "b1", state: buildMessageState(m.text), questions: B1_QUESTIONS }, { cache: "read-write" })));
b1.forEach((o, i) => note(`b1/${GUARDRAIL_MESSAGES[i]!.id}`, o.trace));
const b2Claims = CANNED_CITATIONS.filter((c) => stringStage(c, RFC_SECTIONS) === null);
const b2 = await Promise.all(b2Claims.map((c) => askJev({ scenario: "b2", state: buildClaimState(c.claim, RFC_SECTIONS.find((s) => s.id === c.section_id)!, c.quote), questions: B2_QUESTIONS }, { cache: "read-write" })));
b2.forEach((o, i) => note(`b2/${b2Claims[i]!.id}`, o.trace));
const a3State = buildDocumentState();
const a3 = await Promise.all(A3_PRESET_QUERIES.map((p) => askJev({ scenario: "a3", state: a3State, questions: buildFindQuestions(p.query) }, { cache: "read-write" })));
a3.forEach((o, i) => note(`a3/${i}`, o.trace));
const b3Index = buildIndex(CORPUS);
for (const [qi, p] of B3_PRESET_QUERIES.entries()) {
  const hits = bm25Search(b3Index, p.query, 10);
  const b3 = await Promise.all(hits.map((h) => askJev({ scenario: "b3", state: buildPassageState(p.query, passageById(h.id)!), questions: B3_QUESTIONS }, { cache: "read-write" })));
  b3.forEach((o, i) => note(`b3/${qi}/${hits[i]!.id}`, o.trace));
}
const b4Questions = buildB4Questions(ROOMS);
const b4 = await Promise.all(EXAMPLE_REQUESTS.map((e) => askJev({ scenario: "b4", state: buildRequestState(e.text, INITIAL_HOME), questions: b4Questions }, { cache: "read-write" })));
b4.forEach((o, i) => note(`b4/${i}`, o.trace));
const c1 = await Promise.all(ESSAYS.map((e) => askJev({ scenario: "c1", state: buildEssayState(e), questions: C1_QUESTIONS }, { cache: "read-write" })));
c1.forEach((o, i) => note(`c1/${ESSAYS[i]!.id}`, o.trace));

console.log(`\n${calls} inputs, ${cached} already cached, ${calls - cached} fetched, spent $${usd.toFixed(6)}`);
