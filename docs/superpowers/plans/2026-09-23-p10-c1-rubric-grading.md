# P10 · C1 作业按细则评分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the C1 page: 12 short student answers to one science prompt are graded by Jev against a 4-criterion rubric (one Noul per criterion) plus an on-topic Noul, a misconception Choice and two situational Scores, all in one request per answer. Code counts sentences, composes points / level / flags and routes low-confidence or disagreeing cases to the teacher. Claude writes 2–3 sentences of feedback for a selected answer and Jev verifies that the feedback agrees with the rubric result (B2 pattern).

**Architecture:** `shared/src/datasets/essays.ts` (assignment, rubric, 12 answers with expected levels) and `shared/src/scenarios/c1-grading/{questions,thresholds,sentences,compose,feedback,index}.ts`. `POST /api/c1/grade` fans out one Jev request per essay; `POST /api/c1/feedback` calls Claude then Jev. The page renders a rubric grid (students × criteria) with threshold sliders that re-grade in the browser.

**Spec:** `docs/06-行业场景适用性.md` (教育 row) and the design spec's cost requirements.

## Global Constraints

- New scenario ids `c1 | c2 | c3` are added to `ScenarioId`, `BASELINE_ASSUMPTIONS`, the sidebar (`group: "industry"`, label 行业判断) and i18n.
- Sentence count is computed in code (`sentences.ts`); Jev is never asked to count.
- Thresholds in `thresholds.ts`: `yes 0.7 / no 0.3 / misconceptionMin 0.6 / teacherConfidence 0.6 / minSentences 4 / maxSentences 6 / disagreement 1.5`.
- Essays use Jev cache `read-write` (dataset is fixed); `live: true` bypasses. Feedback is cached in memory per essay.
- English student answers; Chinese UI. Fictional student names.

---

### Task 1: shared — dataset, questions, sentences, compose

```ts
export interface Essay { id: string; student: string; text: string; expected: { levels: number[]; misconception?: MisconceptionId; offTopic?: boolean; teacher?: boolean }; note_zh: string }
export const ASSIGNMENT = { prompt: string; grade: "8th grade science"; rubric: { id: RubricId; title_zh: string; question: string }[] };
export const ESSAYS: Essay[];                       // 12
export type RubricId = "cause_scattering" | "sunset_path" | "names_rayleigh" | "evidence_or_example";
export type MisconceptionId = "none" | "reflects_ocean" | "air_is_blue" | "refraction_not_scattering" | "other_misconception";
export const C1_QUESTIONS: Questions;               // 4 rubric Nouls + on_topic Noul + misconception Choice + overall Score(4) + clarity Score(3)
export function buildEssayState(e: Essay): { assignment: { prompt: string; grade: string }; answer: string };
export function countSentences(text: string): number;
export const C1_THRESHOLDS = { yes: 0.7, no: 0.3, misconceptionMin: 0.6, teacherConfidence: 0.6, minSentences: 4, maxSentences: 6, disagreement: 1.5 };
export type CriterionStatus = "met" | "missed" | "uncertain";
export interface Grade { points: number; maxPoints: 4; level: number; levelConfidence: number | null; criteria: { id: RubricId; status: CriterionStatus; value: number }[]; onTopic: number; misconception: { choice: MisconceptionId; confidence: number } | null; clarity: number; sentences: number; flags: string[]; needsTeacher: boolean; reasons: string[] }
export function gradeFromAnswers(answers: Answers, text: string, t?: typeof C1_THRESHOLDS): Grade;
export const C1_FEEDBACK_QUESTIONS: Questions;      // feedback_consistent, feedback_specific, feedback_kind (Nouls)
export function buildFeedbackState(e: Essay, grade: Grade, feedback: string): { answer: string; rubric_results: Record<RubricId, CriterionStatus>; misconception: MisconceptionId; feedback: string };
```

Rules in `gradeFromAnswers`: criterion ≥ yes → met, ≤ no → missed, else uncertain; points = met count; if on_topic < 0.5 → points 0, flag `off_topic`; sentences outside [4, 6] → flag `too_short` / `too_long`; misconception ≠ none with confidence ≥ misconceptionMin → flag `misconception:<id>`; needsTeacher when any criterion uncertain, overall.confidence < teacherConfidence, |points·(3/4) − overall.score| ≥ disagreement, or misconception confidence in (0.4, 0.6).

- [ ] Tests: 12 essays, unique ids, every expected level 0–3; questions validate (8 ids, misconception options = MisconceptionId set, overall has 4 levels); countSentences ("One. Two! Three?" → 3; abbreviations "e.g." not split; empty → 0); compose boundaries (0.7 → met, 0.3 → missed, 0.5 → uncertain + teacher; off-topic zeroes points; sentence flags; misconception flag at 0.6; disagreement flag).
- [ ] FAIL → implement → PASS → commit.

### Task 2: server

`POST /api/c1/grade { essayIds?, live? }` → `{ results: Record<id, { answers, traceId }>, traces }` (fan-out, like A2). `POST /api/c1/feedback { essayId }` → Claude Sonnet 5 (`effort low`, ≤ 90 words, system: kind, specific, must agree with rubric results, never invent praise) → `{ feedback, verification: { consistent, specific, kind }, traces, cached }` where verification comes from one Jev request on `buildFeedbackState`. Tests with mocks. Mount `/api/c1`. Commit.

### Task 3: web

`/c1`: assignment + rubric header; 评分全部 button; rubric grid (rows students, columns 4 criteria + 主题 + 错误概念 + 水平 + 句数 + 老师), cells coloured by status; sliders yes / no / teacherConfidence (browser re-grade, 零推理); click row → answer text, per-criterion mini bars, overall ScoreLine, misconception ProbBars, clarity, flags, "生成反馈" → Claude feedback + three verification chips. SavingsCard c1; RequestInspector; LearningCard. Screenshot `docs/screenshots/c1-grading.png`. Commit.

### Task 4: smoke, docs, gate, review, merge

Smoke `c1`: 12 essays cache off; print table; assert ≥ 10/12 levels within expected set ±1, misconceptions for E04/E05 detected, E06 off-topic, and E01 all four criteria met. `docs/scenarios/C1.md`; update `docs/scenarios/README.md`, `README.md`, `docs/05-成本模型.md`, `docs/06-行业场景适用性.md` link; warm-cache; gate; review; ff-merge.
