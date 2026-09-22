/**
 * `npm run smoke -- a2 b1` runs each scenario's smoke cases against the real Jev API
 * (cache off) and prints a table. Scenario modules register themselves in SMOKE below
 * as they are implemented; until then only `p0` exists.
 */
import { askJev } from "../server/src/lib/jev";

type Smoke = () => Promise<void>;

async function p0(): Promise<void> {
  const { result, trace } = await askJev(
    {
      scenario: "p0",
      state: "Our API integration started returning 500 errors on every request about 20 minutes ago, and we can't process any customer orders until this is fixed.",
      questions: {
        department: { type: "choice", instructions: "Which team should handle this", criteria: { billing: "Payment or subscription issues", technical: "Bugs or integration problems", sales: "Pricing or account questions" } },
        is_urgent: { type: "noul", instructions: "The message conveys urgency or time-sensitivity" },
        frustration: { type: "score", instructions: "How frustrated the customer appears", criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"] },
      },
    },
    { cache: "off" },
  );
  console.table([
    { question: "department", answer: result.answers.department.choice, confidence: result.answers.department.confidence.toFixed(2) },
    { question: "is_urgent", answer: result.answers.is_urgent.noul.toFixed(2), confidence: "-" },
    { question: "frustration", answer: result.answers.frustration.score.toFixed(2), confidence: result.answers.frustration.confidence.toFixed(2) },
  ]);
  console.log(`model=${trace.model} latency=${trace.latencyMs}ms tokens=${trace.response.usage.input_tokens} cost=$${trace.cost.usd.toFixed(6)}`);
}

export const SMOKE: Record<string, Smoke> = { p0 };

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const ids = wanted.length === 0 || wanted.includes("all") ? Object.keys(SMOKE) : wanted;
let failed = false;
for (const id of ids) {
  const fn = SMOKE[id];
  if (!fn) {
    console.error(`unknown smoke target: ${id} (known: ${Object.keys(SMOKE).join(", ")})`);
    failed = true;
    continue;
  }
  console.log(`\n=== smoke ${id} ===`);
  try {
    await fn();
  } catch (err) {
    failed = true;
    console.error(`smoke ${id} failed:`, err);
  }
}
process.exit(failed ? 1 : 0);
