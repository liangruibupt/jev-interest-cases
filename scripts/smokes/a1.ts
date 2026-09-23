import { A1_PRESETS, summarizeNouls, type AnyAnswer } from "../../shared/src/index";
import { askJev } from "../../server/src/lib/jev";

const fmt = (a: AnyAnswer): { answer: string; confidence: string } => {
  if (a.type === "choice") return { answer: `${a.choice} (${Object.entries(a.probabilities).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")})`, confidence: a.confidence?.toFixed(2) ?? "-" };
  if (a.type === "score") return { answer: `${a.score.toFixed(2)} (${Object.entries(a.probabilities).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")})`, confidence: a.confidence?.toFixed(2) ?? "-" };
  return { answer: a.noul.toFixed(2), confidence: "-" };
};

/** Runs six presets against the real API and asserts the expectations written in each preset's lesson. */
export async function a1(): Promise<void> {
  const failures: string[] = [];
  const ids = ["quickstart", "literal", "counting", "score-levels", "contrastive", "cjk"];
  for (const id of ids) {
    const p = A1_PRESETS.find((x) => x.id === id)!;
    const { result, trace } = await askJev({ scenario: "a1", state: p.state, questions: p.questions }, { cache: "off" });
    const answers = result.answers as Record<string, AnyAnswer>;
    console.log(`\n--- ${p.title_zh} ---`);
    console.table(Object.entries(answers).map(([q, a]) => ({ question: q, ...fmt(a) })));
    console.log(`latency=${trace.latencyMs}ms tokens=${trace.response.usage.input_tokens} cost=$${trace.cost.usd.toFixed(6)}`);
    const get = (q: string) => answers[q]!;
    const check = (ok: boolean, msg: string) => {
      if (!ok) failures.push(`${id}: ${msg}`);
    };
    switch (id) {
      case "quickstart": {
        const u = get("is_urgent");
        const d = get("department");
        check(u.type === "noul" && u.noul > 0.8, "is_urgent should be > 0.8");
        check(d.type === "choice" && d.choice === "technical", "department should be technical");
        break;
      }
      case "literal": {
        const c = get("contains_personal_data");
        const f = get("free_of_personal_data");
        check(c.type === "noul" && c.noul > 0.7, "contains_personal_data should be > 0.7");
        check(f.type === "noul" && c.type === "noul" && f.noul < c.noul, "free_of_personal_data should be lower than contains_personal_data");
        break;
      }
      case "counting": {
        const n = summarizeNouls(answers, p.summarize!);
        console.log(`代码求和 = ${n}`);
        check(n === 3, `code sum should be 3, got ${n}`);
        break;
      }
      case "score-levels": {
        const num = get("severity_numeric");
        const desc = get("severity_descriptive");
        check(num.type === "score" && desc.type === "score" && (desc.confidence ?? 0) > (num.confidence ?? 0), "descriptive levels should be more confident than numeric levels");
        check(desc.type === "score" && desc.score < 0.5, "descriptive severity should be near 0 (Cosmetic)");
        break;
      }
      case "contrastive": {
        const a = get("return_topic_plain");
        const b = get("return_topic_structured");
        check(a.type === "choice" && a.choice === "return_status", "plain should choose return_status");
        check(b.type === "choice" && b.choice === "return_status", "structured should choose return_status");
        break;
      }
      case "cjk": {
        const u = get("is_urgent");
        check(u.type === "noul" && u.noul > 0.5, "cjk is_urgent should still lean yes");
        break;
      }
    }
  }
  if (failures.length) throw new Error(`A1 smoke assertions failed:\n${failures.join("\n")}`);
}
