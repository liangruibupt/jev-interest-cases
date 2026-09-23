# P3 · A4 一致性与校准对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the A4 experiment page: the same battery of questions asked N times (3–15) of Jev and of Claude (Sonnet 4.6 at temperature 0 and default, Sonnet 5, Opus 5; Fable 5.1 / Haiku 4.5 optional) through the LLM System One adapter, streamed over SSE, summarised into per-question stability, uncertainty, latency and cost metrics, rendered as heatmaps and bars, with the result exported to `docs/results/`.

**Architecture:** Cases (state + questions) and the pure metrics live in `shared/src/scenarios/a4-consistency/`. The server route `GET /api/a4/run` is an SSE stream: arms run concurrently, runs within an arm run sequentially (honest per-call latency); Jev is called with `cache: "off"`, LLM arms through `askLlmSystemOne`. The browser consumes the stream with `EventSource`, keeps every run's answers, and computes metrics client-side from `@jev/shared` so the summary updates live.

**Tech Stack:** as before; `hono/streaming` `streamSSE`; browser `EventSource`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-jev-lab-design.md` §4 A4, §3.2 `llmSystemOne`, §5 (A4 row).

## Global Constraints

- Jev runs always bypass the cache. Every LLM arm gets exactly the same `state` and `questions` text.
- Claude 5 family never receives `temperature`; the Sonnet 4.6 arms are the only ones that set it (`t0`).
- LLM answers carry `confidence: null`; comparisons use `probabilities` only (top probability, per-option std), never Jev's `confidence`.
- Show the estimated cost before starting; cap `runs` at 15 and arms at 6 per request.
- Categorical colours for labels come from one fixed-order palette validated with the dataviz validator (`node <dataviz skill>/scripts/validate_palette.js "<hex,...>" --mode light`); ≤ 8 labels per question, otherwise fold the tail into "其他".

---

### Task 1: shared — cases, arms, metrics

**Files:**
- Create: `shared/src/scenarios/a4-consistency/cases.ts`, `arms.ts`, `metrics.ts`, `index.ts`
- Test: `cases.test.ts`, `metrics.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
```ts
export interface A4Case { id: "moderation" | "ticket"; title_zh: string; description_zh: string; state: EntryType; questions: Questions; }
export const A4_CASES: A4Case[];
export type ArmId = "jev" | "sonnet46_t0" | "sonnet46" | "sonnet5" | "opus5" | "fable51" | "haiku45";
export interface Arm { id: ArmId; label: string; kind: "jev" | "llm"; tier?: ClaudeTierId; temperature?: number; enabledByDefault: boolean; note_zh: string; }
export const A4_ARMS: Arm[];
export const A4_LIMITS = { minRuns: 3, maxRuns: 15, maxArms: 6, uncertainBelow: 0.6 };
export interface RunRecord { arm: ArmId; run: number; answers: Answers; latencyMs: number; costUsd: number; inputTokens: number; outputTokens: number; traceId: string; degenerate?: string[]; normalizationDelta?: Record<string, number>; }
export interface QuestionMetrics { questionId: string; modalLabel: string; rawAgreement: number; policyAgreement: number; uncertainShare: number; meanStd: number; labelsPerRun: string[]; topProbPerRun: number[]; }
export interface ArmMetrics { arm: ArmId; runs: number; questions: QuestionMetrics[]; meanRawAgreement: number; meanPolicyAgreement: number; meanUncertainShare: number; meanStd: number; meanLatencyMs: number; p50LatencyMs: number; totalUsd: number; usdPerCall: number; }
export function topLabel(answer: AnyAnswer): { label: string; prob: number };   // choice → choice/prob; score → argmax level; noul → "yes"/"no" with p
export function computeArmMetrics(arm: ArmId, records: RunRecord[], questions: Questions, uncertainBelow?: number): ArmMetrics;
export function ratiosVsJev(all: ArmMetrics[]): Record<ArmId, { latency: number | null; cost: number | null }>;
export function estimateRunCost(caseId: A4Case["id"], arms: ArmId[], runs: number): { usd: number; perArm: Record<ArmId, number> };  // Jev 1.2k tokens; LLM 1.4k in + 300 out at tier price
```

**Case 1 `moderation`** — state:
```json
{ "post": { "id": "P-88213", "community": "r/gamedebates", "author": "frostbyte_77",
  "text": "lol @nova_knight you got carried all season and everyone knows it. keep crying about the patch, nobody wants you in ranked anyway. real players are moving to our server, link in bio: discord.gg/xk9-ranked. see you never",
  "author_history": { "prior_strikes": 1, "account_age_days": 412 }, "reports": 4, "report_reasons": ["harassment", "spam link", "toxicity", "harassment"] } }
```
Eight Choice questions (labels are the option keys):
- `category` "What is the single most applicable content-policy category for `post.text`?" — none / harassment / hate / violence / spam / sexual (each with a one-line description).
- `primary_risk` "What is the primary moderation risk that should drive triage for this post?" — harassment / violence / link_abuse / account_history / low_risk.
- `target` "Who is the target of the hostile content in `post.text`, if any?" — individual / group / platform / none.
- `action` "What enforcement action should be taken on this post?" — allow / warn / remove / strike / escalate.
- `queue` "Which review queue should receive this post?" — none / standard / priority / legal.
- `link_handling` "How should the link in `post.text` be handled?" — keep / remove_link / warn_user / treat_as_brigading.
- `review_path` "Who should confirm the decision?" — automated / human_reviewer / senior_reviewer.
- `severity` "How severe is the policy violation in `post.text`?" — none / low / medium / high.

**Case 2 `ticket`** — state = `buildTicketState(TICKETS T23)`; questions = pick `department, requested_resolution, bug_severity, refund_requested, mentions_open_order, frustration` from `A2_QUESTIONS` (mixed Choice/Score/Noul so the heatmap shows all primitives).

**Arms:** `jev` (Jev, kind jev); `sonnet46_t0` (prev_sonnet, temperature 0, "LLM 最稳的设置"); `sonnet46` (prev_sonnet, default sampling); `sonnet5` (standard); `opus5` (strong); `fable51` (frontier, disabled by default); `haiku45` (haiku, disabled by default, "复现官方 cookbook 数字").

**Metrics definitions:** for each question: `labelsPerRun[i] = topLabel(answers_i)`; `modalLabel` = most frequent; `rawAgreement` = share of runs whose label equals modal; policy label = `topProb < uncertainBelow ? "uncertain" : label`; `policyAgreement` = share equal to the policy modal; `uncertainShare` = share of runs labelled uncertain; `meanStd` = mean over options of the std of that option's probability across runs (Noul: std of `noul`). Arm aggregates are means over questions; latency mean and p50 over runs; `usdPerCall = totalUsd / runs`.

- [ ] **Step 1: tests** — `cases.test.ts`: both cases validate; moderation has 8 Choice questions; ticket has 6 mixed questions taken from `A2_QUESTIONS`; `estimateRunCost("moderation", ["jev","sonnet5"], 15).usd` is between 0.05 and 0.20. `metrics.test.ts`: fixtures — 4 identical runs → raw/policy agreement 1, std 0; alternating labels with probs 0.55/0.45 → rawAgreement 0.5, uncertainShare 1, policyAgreement 1 (all "uncertain"); a Score answer's `topLabel` is the argmax level; a Noul at 0.7 → label "yes", 0.3 → "no"; `ratiosVsJev` divides by the jev arm and returns null when jev absent.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS; commit `feat(shared): A4 cases, arms and consistency metrics`.

---

### Task 2: server — SSE run route and result export

**Files:**
- Create: `server/src/routes/a4.ts`; Test: `server/src/routes/a4.test.ts`; Modify: `server/src/app.ts`

**Interfaces:** `createA4Routes({ askJev, askLlmSystemOne, resultsDir? })`; `GET /run?caseId=moderation&runs=5&arms=jev,sonnet5&nonce=1` → `text/event-stream` with events:
- `start` `{ caseId, runs, arms, estimatedUsd }`
- `run` `RunRecord`
- `arm_error` `{ arm, run, message }` (one arm failing does not stop the others)
- `done` `{ savedTo: string | null, totalUsd }`
Validation: unknown case/arm → 400 before streaming; `runs` clamped to `[3, 15]`; arms ≤ 6. When `nonce=1`, add `uid: "<caseId>:<run>:<random>"` to the state object (cookbook practice; documented limitation). Arms run concurrently via `Promise.all`; within an arm runs are sequential. Jev calls use `{ cache: "off" }`. On `done`, write `docs/results/a4-<caseId>-<ISO timestamp>.json` `{ caseId, runs, arms, records, startedAt, finishedAt }` (skip when `resultsDir` is null in tests). Record every trace in `usage`.

- [ ] **Step 1: test** — consume `app.request("/run?caseId=ticket&runs=3&arms=jev,sonnet5")` with mocked `askJev` (returns fixed answers, latency 100) and `askLlmSystemOne` (fixed answers, latency 900); parse the SSE text; expect 1 `start`, 6 `run` events (3 per arm), 1 `done`; Jev mock called with `cache: "off"`; LLM mock called with `tier: "standard"` and no `temperature`; a second request with `arms=sonnet46_t0` passes `temperature: 0` and `tier: "prev_sonnet"`; `runs=99` is clamped to 15 in `start`; unknown arm → 400.
- [ ] **Step 2–4:** FAIL → implement with `streamSSE` from `hono/streaming` → PASS → mount → commit `feat(server): A4 SSE experiment route`.

---

### Task 3: web — experiment page

**Files:**
- Create: `web/src/pages/A4Consistency.tsx`, `web/src/components/Heatmap.tsx`, `web/src/components/BarList.tsx`, `web/src/lib/palette.ts`, `web/src/lib/sse.ts`
- Modify: `web/src/App.tsx`, `web/src/app/scenarios.ts` (a4 available), `web/src/i18n/zh.ts`

**Palette (`palette.ts`):** one fixed-order categorical list of 8 hexes chosen from the dataviz reference palette and validated with `validate_palette.js --mode light` (record the validator output in the commit message). Labels map to colours by **first-appearance order within a question**, stable across arms (same label → same colour in every heatmap of that question). `uncertain` is rendered as a hatched cell (CSS `repeating-linear-gradient` 45°) over the label colour.

**Behaviour:**
- Controls: case radio (审核帖 / 工单 T23), runs slider 3–15 (default 10), arm checkboxes (default-enabled arms checked; disabled-by-default arms shown with "可选" and unchecked), nonce checkbox with explanation, "预估费用 $x" computed from `estimateRunCost`, 开始 button (disabled while running), 停止 button (closes the EventSource).
- Streaming: `openSse(url, handlers)` in `lib/sse.ts` wraps `EventSource`; each `run` event appends a `RunRecord`; progress "臂 n/m · 轮 r/R" per arm; errors listed.
- Heatmaps: one panel per arm; rows = questions (label with type badge), columns = runs; cell colour = top label, hatched when `topProb < 0.6`; hover title `label p=0.83`; below each panel: raw agreement %, policy agreement %, uncertain %, mean std, p50 latency, cost/call.
- Bars (`BarList`): three horizontal bar groups across arms — p50 latency (log scale, ms), cost per call (log scale, $), mean std — Jev bar in Jev blue, LLM bars in Claude amber; value labels in ink.
- Summary table in the cookbook's format (arm, latency, cost/call, ratio vs Jev, mean std, raw agreement, policy agreement, uncertain share) and an auto-generated conclusion sentence, e.g. "Jev p50 612ms / $0.00005；Sonnet 5 4.8s / $0.0052 → 快 7.8×、便宜 104×；策略一致率 Jev 99% vs Sonnet 5 93%".
- `SavingsCard scenario="a4"` over the Jev traces (the LLM traces are shown in the CostMeter as Claude spend), `RequestInspector` (collapsed, all traces), `LearningCard` (proves: 校准 vs 稳定性、LLM 口头概率 vs RLCD、为什么只比概率不比 confidence; tryThis: 开 nonce 看是否有变化、把 uncertainBelow 换成 0.8、只跑 jev 15 轮; pitfalls: t=0 的低方差 ≠ 校准、LLM 结构化输出可能被归一化、单案例不代表整体).
- Also show the LLM adapter's `normalizationDelta` average and `degenerate` count per arm as a small line ("概率和偏离 1 的均值 0.03；退化分布 0 次") — this is a real finding about verbalized probabilities.

- [ ] **Step 1:** validate palette, implement components and page; typecheck.
- [ ] **Step 2:** Playwright: open `/a4`, case ticket, runs 3, arms jev + sonnet5, start, wait for `done`, screenshot `docs/screenshots/a4-heatmap.png`; confirm the summary table has two rows and ratios are shown.
- [ ] **Step 3:** commit `feat(web): A4 consistency experiment with live heatmaps`.

---

### Task 4: full run, smoke, docs, gate

- [ ] `scripts/smokes/a4.ts`: 3 runs, `jev` only, case `moderation` (cheap); prints per-question labels and mean std; asserts raw agreement ≥ 0.75 on at least 6 of 8 questions.
- [ ] Full experiment via the page: case `moderation`, runs 15, arms `jev, sonnet46_t0, sonnet46, sonnet5, opus5` (≈ $0.6); result JSON lands in `docs/results/`; repeat with case `ticket`, runs 10.
- [ ] `docs/scenarios/A4.md`: method (arms, nonce, metrics definitions), both cases' questions, the cookbook-format table with our numbers next to the official ones (Jev 114ms/$0.000046; Haiku 3.85s/$0.0035; Opus 4.8 reasoning 10.4s/$0.028), heatmap screenshot, honest discussion (network latency floor ≈ 0.3s; LLM normalisation deltas; which questions flip), 试一试, 陷阱, links (`/cookbooks/consistency_choice_cookbook`, `/introduction/machine-learning-primer`, `/confidence`).
- [ ] Update `docs/scenarios/README.md`, `README.md` (A4 ✔), `docs/05-成本模型.md` (A4 measured row with real Claude costs).
- [ ] Gate: `npm test`, `npm run typecheck`, `npm run smoke -- a4`; commit `feat: A4 experiment results, smoke and docs`.
