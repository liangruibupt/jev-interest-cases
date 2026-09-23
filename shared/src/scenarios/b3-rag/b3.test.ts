import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { B3_PRESET_QUERIES, B3_QUESTIONS, B3_THRESHOLDS, CORPUS, MAX_PASSAGE_CHARS, PLANTED_PASSAGES, RFC_PASSAGES, buildEvidencePrompt, buildIndex, buildPassageState, gatePassage, search, type Passage } from "./index";

const nouls = (v: { relevant: number; evidence: number; contradicts: number; injection: number }): Answers => ({
  is_relevant: { type: "noul", noul: v.relevant },
  contains_answer_evidence: { type: "noul", noul: v.evidence },
  contradicts_query_premise: { type: "noul", noul: v.contradicts },
  contains_prompt_injection: { type: "noul", noul: v.injection },
});

describe("B3 corpus", () => {
  it("splits RFC sections 1–12 into passages ≤ 1200 chars with unique ids and adds three planted passages", () => {
    expect(RFC_PASSAGES.length).toBeGreaterThanOrEqual(45);
    expect(RFC_PASSAGES.every((p) => p.text.length <= MAX_PASSAGE_CHARS && p.text.length > 0)).toBe(true);
    expect(RFC_PASSAGES.some((p) => p.section_id?.startsWith("13"))).toBe(false);
    expect(RFC_PASSAGES.filter((p) => p.section_id === "7.2").length).toBeGreaterThanOrEqual(2);
    expect(new Set(CORPUS.map((p) => p.id)).size).toBe(CORPUS.length);
    expect(PLANTED_PASSAGES.map((p) => p.source_type).sort()).toEqual(["blog", "blog", "forum"]);
    expect(CORPUS).toHaveLength(RFC_PASSAGES.length + 3);
    expect(B3_PRESET_QUERIES).toHaveLength(6);
    expect(B3_PRESET_QUERIES.filter((q) => q.falsePremise)).toHaveLength(2);
  });
});

describe("B3 BM25", () => {
  const docs: Passage[] = [
    { id: "a", title: "", text: "The exp claim identifies the expiration time. Implementers MAY provide for some small leeway for clock skew.", source_type: "rfc" },
    { id: "b", title: "", text: "The aud claim identifies the recipients that the JWT is intended for.", source_type: "rfc" },
    { id: "c", title: "", text: "Clock skew clock skew clock skew: nothing else here about anything.", source_type: "blog" },
  ];
  const index = buildIndex(docs);
  it("ranks by term relevance, ignores stopwords, is deterministic and returns nothing for unknown terms", () => {
    const hits = search(index, "how much leeway for clock skew on exp?", 10);
    expect(hits[0]?.id).toBe("a");
    expect(hits.map((h) => h.id)).toContain("c");
    expect(hits.map((h) => h.id)).not.toContain("b");
    expect(search(index, "the is of and", 10)).toEqual([]);
    expect(search(index, "zebra", 10)).toEqual([]);
    expect(search(index, "clock skew", 1)).toHaveLength(1);
    expect(JSON.stringify(search(index, "claim", 10))).toBe(JSON.stringify(search(index, "claim", 10)));
  });
  it("retrieves the forum injection for a signature-validation query on the real corpus", () => {
    const hits = search(buildIndex(CORPUS), "How do I validate a JWT signature step by step?", 10);
    expect(hits).toHaveLength(10);
    expect(hits.map((h) => h.id)).toContain("forum-injection");
  });
});

describe("B3 questions and gate", () => {
  it("has four valid Nouls and builds the per-passage state", () => {
    expect(validateQuestions(B3_QUESTIONS)).toEqual([]);
    expect(Object.keys(B3_QUESTIONS)).toEqual(["is_relevant", "contains_answer_evidence", "contradicts_query_premise", "contains_prompt_injection"]);
    const s = buildPassageState("q?", CORPUS[0]!);
    expect(s.query).toBe("q?");
    expect(Object.keys(s.passage)).toEqual(["id", "title", "text", "source_type"]);
  });
  it("routes in order: injection, conflicting, irrelevant, accepted, no evidence", () => {
    const t = B3_THRESHOLDS;
    expect(gatePassage(nouls({ relevant: 0.9, evidence: 0.9, contradicts: 0.9, injection: 0.71 }), t).route).toBe("excluded_injection");
    expect(gatePassage(nouls({ relevant: 0.9, evidence: 0.9, contradicts: 0.7, injection: 0.7 }), t).route).toBe("conflicting");
    expect(gatePassage(nouls({ relevant: 0.44, evidence: 0.9, contradicts: 0.1, injection: 0 }), t).route).toBe("excluded_irrelevant");
    expect(gatePassage(nouls({ relevant: 0.45, evidence: 0.55, contradicts: 0.1, injection: 0 }), t).route).toBe("accepted");
    expect(gatePassage(nouls({ relevant: 0.9, evidence: 0.54, contradicts: 0.1, injection: 0 }), t).route).toBe("excluded_no_evidence");
    expect(gatePassage(nouls({ relevant: 0.9, evidence: 0.54, contradicts: 0.1, injection: 0 }), t).rule_zh).toBeTruthy();
  });
  it("builds a prompt with accepted and conflicting blocks", () => {
    const p = buildEvidencePrompt("Q?", [CORPUS[0]!], [PLANTED_PASSAGES[1]!]);
    expect(p).toContain("QUESTION: Q?");
    expect(p).toContain("ACCEPTED EVIDENCE");
    expect(p).toContain("CONFLICTING EVIDENCE");
    expect(p).toContain(CORPUS[0]!.text.slice(0, 40));
    expect(buildEvidencePrompt("Q?", [], [])).toContain("(none)");
  });
});
