# P5 · B2 引用核验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the B2 page: Claude answers a question about RFC 7519 (JWT) with citations (claim + section id + verbatim quote); code checks each quote by string match (fabricated / misattributed), then Jev judges whether the cited section supports / contradicts / says nothing about the claim, with a confidence gate for human review. Eight canned citations reproduce every verdict without spending on Claude.

**Architecture:** `shared/src/scenarios/b2-citations/` holds the section parser, the canned citations, the two Jev questions, thresholds, string matching and the verdict composition. `POST /api/b2/answer` calls Claude through `claudeParse` with the RFC body in the prompt; `POST /api/b2/verify` runs matching + Jev per claim (fan-out through the queue). The page renders claims as badges and shows the cited section with the quote highlighted.

**Spec:** `docs/superpowers/specs/2026-09-22-jev-lab-design.md` §4 B2, §5 (B2 rows).

## Global Constraints

- Quote matching is done on `normalizeText()` output (fold whitespace, quotes, dashes, case) — the RFC wraps lines and even breaks a sentence across a page footer.
- Claims whose quote is not found never reach Jev (verdict `fabricated`, or `misattributed` when the quote exists in a different section).
- Jev state per claim: `{ claim, section: { id, title, text }, quote }`; questions `relation` (Choice) + `quote_supports` (Noul). `relation.confidence < 0.8` → `review: true`.
- Generation defaults to Claude Sonnet 5 (`standard`); the page can switch to Opus 5. The RFC body sent to Claude is sections 1–12 (references and appendices dropped).

---

### Task 1: shared — sections, canned citations, questions, matching, verdicts

**Files:**
- Create: `shared/src/scenarios/b2-citations/{sections,citations,questions,thresholds,match,compose,index}.ts`
- Test: `sections.test.ts`, `match.test.ts`, `compose.test.ts`, `citations.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
```ts
export interface RfcSection { id: string; title: string; text: string; }         // id "4.1.4", title '"exp" (Expiration Time) Claim'
export function parseRfcSections(text: string): RfcSection[];                      // 45 sections from RFC7519_TEXT
export const RFC_SECTIONS: RfcSection[];
export function rfcBodyForPrompt(): string;                                        // sections 1..12 joined, ≈40k chars
export interface Citation { id: string; claim: string; section_id: string; quote: string; }
export type Verdict = "verified" | "contradicted" | "unsupported" | "fabricated" | "misattributed";
export interface CannedCitation extends Citation { expected: Verdict; note_zh: string; }
export const CANNED_CITATIONS: CannedCitation[];                                   // 8 items
export const B2_QUESTIONS: Questions;                                              // relation (Choice), quote_supports (Noul)
export const B2_THRESHOLDS = { autoAccept: 0.8, quoteSupportsYes: 0.7 };
export interface MatchResult { found: boolean; foundIn?: string; index?: number; }
export function locateQuote(quote: string, section: RfcSection): MatchResult;      // normalized substring search
export function findQuoteAnywhere(quote: string, sections: RfcSection[]): string | undefined;
export interface ClaimVerdict { id: string; verdict: Verdict; review: boolean; relation?: { choice: string; probabilities: Record<string, number>; confidence: number | null }; quoteSupports?: number; disagreement?: boolean; matchedIn?: string; }
export function verdictFromMatch(c: Citation, match: MatchResult, elsewhere?: string): ClaimVerdict | null;  // null → needs Jev
export function verdictFromAnswers(c: Citation, answers: Answers, t?: typeof B2_THRESHOLDS): ClaimVerdict;
```

**Canned citations (expected verdict):**
1. `exp_leeway` — claim "Implementers may allow a small leeway of a few minutes for clock skew when checking the exp claim." · 4.1.4 · quote "Implementers MAY provide for some small leeway, usually no more than a few minutes, to account for clock skew." → verified
2. `aud_reject` — "If the principal processing the JWT does not identify itself with a value in the aud claim when that claim is present, the JWT must be rejected." · 4.1.3 · quote "If the principal processing the claim does not identify itself with a value in the \"aud\" claim when this claim is present, then the JWT MUST be rejected." → verified
3. `hs256_mandatory` — "Conforming JWT implementations must implement HS256 and the none algorithm." · 8 · quote "only HMAC SHA-256 (\"HS256\") and \"none\" MUST be implemented by conforming JWT implementations." → verified
4. `sign_then_encrypt` — "When both signing and encryption are needed, producers should normally sign first and then encrypt." · 11.2 · quote "normally producers should sign the message and then encrypt the result" → verified (the RFC breaks this sentence across a page footer; normalization must survive it)
5. `exp_required` — "Every JWT is required to carry an exp claim." · 4.1.4 · quote "Use of this claim is OPTIONAL." → contradicted
6. `jti_uuid` — "The jti claim must be a version 4 UUID." · 4.1.7 · quote "The \"jti\" value MUST be a UUID as defined in RFC 4122." → fabricated
7. `jwks_required` — "Validating a JWT requires fetching the issuer's JWKS endpoint to check the signature." · 7.2 · quote "Verify that the JWT contains at least one period ('.') character." → unsupported (says_nothing)
8. `encryption_optional_misattributed` — "Support for encrypted JWTs is optional for implementations." · 4.1.4 · quote "Support for encrypted JWTs is OPTIONAL." → misattributed (the quote lives in section 8)

**Questions:**
- `relation` Choice "How does `section.text` relate to `claim`?" · supports "The section states the claim or directly implies that it is true" · contradicts "The section states the opposite of the claim or implies it is false" · says_nothing "The section does not address what the claim asserts, either way".
- `quote_supports` Noul "Read in the context of `section.text`, does `quote` state or directly imply `claim`?"

**Composition:** verdict = relation choice → verified / contradicted / unsupported; `review = (relation.confidence ?? 0) < autoAccept`; `disagreement = quoteSupports ≥ quoteSupportsYes && verdict !== "verified"` (shown as "引文支持但上下文不支持").

- [ ] Tests: `sections.test.ts` (45 sections; ids include "4.1.4" and "11.2"; section 4.1.4 text contains "OPTIONAL"; no TOC dot leaders; `rfcBodyForPrompt()` length between 30k and 55k and excludes "13.  References"); `match.test.ts` (quote with line wrap found; page-footer-broken quote #4 found in 11.2; curly quotes folded; fabricated quote not found anywhere; misattributed quote found in "8"); `compose.test.ts` (verdict mapping, review gate at 0.79/0.8, disagreement flag); `citations.test.ts` (8 unique ids; every section_id exists; string-match stage alone yields exactly 1 fabricated + 1 misattributed and sends 6 to Jev).
- [ ] FAIL → implement → PASS → commit `feat(shared): B2 RFC sections, canned citations, matching and verdicts`.

---

### Task 2: server — answer + verify

**Files:** `server/src/routes/b2.ts`, `server/src/routes/b2.test.ts`; mount in `app.ts`.

- `POST /answer { question, tier?: "standard"|"strong", injectErrors?: boolean }` → `claudeParse` with schema `{ answer: string, claims: { claim: string, section_id: string, quote: string }[] (1–8) }`, system prompt: answer from the RFC only, cite 2–6 claims, each `quote` must be copied verbatim from the cited section (≤ 40 words), `section_id` from the provided list. `maxTokens 1500`, `effort "low"`. When `injectErrors`, deterministically corrupt claim 0's `section_id` to the next section id and claim 1's quote by replacing its first word with "Never" (so the demo reproduces fabricated + misattributed). Returns `{ answer, claims, traces, tier }`. Claude call is cached per `(question, tier)` in an in-memory Map so repeated demos do not re-spend.
- `POST /verify { claims: Citation[] }` (≤ 12) → string stage in code, Jev fan-out for the rest (`cache: "read-write"` — claims are deterministic text), `{ results: ClaimVerdict[], traces }`.
- `GET /sections` → `{ sections: RfcSection[] }` (id/title/text) for the viewer.
- [ ] Tests with mocked `claudeParse` / `askJev`: verify runs zero Jev calls for fabricated/misattributed claims and one per remaining claim; verdict mapping; `injectErrors` corrupts two claims; bad input 400.
- [ ] Commit `feat(server): B2 answer and verify endpoints`.

---

### Task 3: web — page

**Files:** `web/src/pages/B2Citations.tsx`; modify `App.tsx`, `scenarios.ts` (b2 available), `i18n/zh.ts`.

- Top: question box with 5 presets ("How does exp handle clock skew?", "Which algorithms must every JWT implementation support?", "When should a nested JWT be signed vs encrypted?", "Is the aud claim mandatory and how is it validated?", "How does a JWT indicate that it contains another JWT?"); tier select (Sonnet 5 / Opus 5); "注入错误" checkbox; button 生成并核验; button "使用官方 8 条预置引文（不调用 Claude）".
- Middle: the answer text; below it the claims list — each claim row has badge (绿 已核实 / 红 相矛盾 / 黄 无依据 / 橙 捏造 / 紫 误标章节 / 灰 待复核), the cited section id, `relation` ProbBars, ConfidenceRing, quote_supports value, and "引文支持但上下文不支持" flag when disagreement; click → right pane shows the section text with the quote highlighted (using `locateQuote` index on normalized text mapped back by a simple search on the raw text; fall back to highlighting nothing).
- Summary chips (counts per verdict) + cost strip: Claude generation cost, Jev verification cost, "若让同一 LLM 逐条复核 ≈ $x" (SavingsCard b2 over Jev traces, tier select).
- `RequestInspector`, `LearningCard`.
- [ ] Playwright: preset canned → 8 badges with the expected pattern, screenshot `docs/screenshots/b2-citations.png`; then one real question with Sonnet 5 → badges appear; commit `feat(web): B2 citation checker`.

---

### Task 4: smoke, docs, gate, merge

- [ ] `scripts/smokes/b2.ts`: verify the 8 canned citations (Jev cache off), print `id / expected / verdict / relation probs / confidence / quote_supports`, assert ≥ 7/8 match expected and that `fabricated`/`misattributed` never call Jev.
- [ ] `docs/scenarios/B2.md`: pipeline, questions, canned table with measured numbers, one real Claude answer with its verdicts, cost (Jev per claim vs LLM re-check; end-to-end), 试一试, 陷阱, links (`/cookbooks/citation_check`).
- [ ] Update `docs/scenarios/README.md`, `README.md`, `docs/05-成本模型.md`; extend `warm-cache` with the 8 canned claims; gate; ff-merge to main.
