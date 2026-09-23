/** `npm run latency` — six sequential uncached Jev calls to see steady-state latency from this network. */
import { askJev } from "../server/src/lib/jev";

const questions = { is_urgent: { type: "noul" as const, instructions: "Does this message express urgency?" } };
const states = [
  "Please help ASAP, my payouts are failing.",
  "How do I change my email address?",
  "Thanks, that fixed it!",
  "Our checkout is down and we are losing orders every minute.",
  "When does the free trial end?",
  "I have asked three times now. Can I please talk to a real person?",
];
const rows: Record<string, unknown>[] = [];
for (const state of states) {
  const t0 = performance.now();
  const { result, trace } = await askJev({ scenario: "p0", state, questions }, { cache: "off" });
  rows.push({ state: state.slice(0, 44), noul: result.answers.is_urgent.noul.toFixed(2), latencyMs: trace.latencyMs, wallMs: Math.round(performance.now() - t0), tokens: trace.response.usage.input_tokens });
}
console.table(rows);
