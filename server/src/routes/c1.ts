import { C1_FEEDBACK_QUESTIONS, C1_QUESTIONS, C1_THRESHOLDS, ESSAYS, buildEssayState, buildFeedbackState, gradeFromAnswers, stableStringify, type Answers, type C1Thresholds, type Grade, type JevTrace, type Trace } from "@jev/shared";
import { Hono } from "hono";
import { claudeText as defaultClaudeText } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

export const FEEDBACK_SYSTEM =
  "You are a kind 8th-grade science teacher writing feedback to one student about their short answer. " +
  "Use RUBRIC_RESULTS exactly: praise only criteria marked met, point out what is missing for criteria marked missed, and gently correct the misconception if one is listed. " +
  "Neither praise nor fault a criterion marked uncertain. Never invent praise for something the student did not do. Address the student directly, 2 to 3 sentences, under 90 words, plain text.";

/** Client thresholds are optional; unknown keys are ignored and non-finite values fall back to the defaults. */
export function parseThresholds(raw: unknown): C1Thresholds {
  const t: C1Thresholds = { ...C1_THRESHOLDS };
  if (typeof raw !== "object" || raw === null) return t;
  for (const key of Object.keys(t) as (keyof C1Thresholds)[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) t[key] = v;
  }
  return t;
}

interface GradeBody {
  essayIds?: string[];
  live?: boolean;
}

interface FeedbackCacheEntry {
  feedback: string;
  grade: Grade;
  verification: { consistent: number; specific: number; kind: number };
  traces: Trace[];
}

/**
 * One Jev request per essay (eight questions). Grades are composed in the browser so the sliders never
 * trigger inference; the server only composes when it needs the grade for Claude's feedback prompt.
 */
export function createC1Routes(deps: { askJev: typeof defaultAskJev; claudeText: typeof defaultClaudeText }) {
  const app = new Hono();
  app.onError(apiErrorHandler);
  const feedbackCache = new Map<string, FeedbackCacheEntry>();

  app.post("/grade", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as GradeBody;
    if (body.essayIds !== undefined && !(Array.isArray(body.essayIds) && body.essayIds.every((s) => typeof s === "string"))) throw new BadRequestError("essayIds 必须是字符串数组");
    const wanted = body.essayIds ?? ESSAYS.map((e) => e.id);
    const unknown = wanted.filter((id) => !ESSAYS.some((e) => e.id === id));
    if (unknown.length) throw new BadRequestError(`未知的作业 ID：${unknown.join(", ")}`, { unknown });
    const essays = ESSAYS.filter((e) => wanted.includes(e.id));
    const cache = body.live ? "off" : "read-write";
    // Record each completed call as it lands so one failure never discards the others.
    const traces: JevTrace[] = [];
    const settled = await Promise.allSettled(
      essays.map(async (e) => {
        const o = await deps.askJev({ scenario: "c1", state: buildEssayState(e), questions: C1_QUESTIONS }, { cache });
        usage.record(o.trace);
        traces.push(o.trace);
        return o;
      }),
    );
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const errors: Record<string, string> = {};
    settled.forEach((s, i) => {
      const id = essays[i]!.id;
      if (s.status === "fulfilled") results[id] = { answers: s.value.result.answers as unknown as Answers, traceId: s.value.trace.id };
      else errors[id] = s.reason instanceof Error ? s.reason.message : String(s.reason);
    });
    return c.json({ results, errors, traces, model: traces[0]?.model ?? null });
  });

  app.post("/feedback", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { essayId?: unknown; thresholds?: unknown; live?: unknown };
    const essay = ESSAYS.find((e) => e.id === body.essayId);
    if (!essay) throw new BadRequestError("未知的作业 ID", { essayId: body.essayId });
    // The grade Claude writes against must be the grade the page shows, so the page's thresholds come along.
    const thresholds = parseThresholds(body.thresholds);
    const live = body.live === true;
    const key = `${essay.id}:${stableStringify(thresholds)}`;
    const hit = live ? undefined : feedbackCache.get(key);
    if (hit) return c.json({ ...hit, traces: [], cached: true });

    const traces: Trace[] = [];
    const graded = await deps.askJev({ scenario: "c1", state: buildEssayState(essay), questions: C1_QUESTIONS }, { cache: live ? "off" : "read-write" });
    usage.record(graded.trace);
    traces.push(graded.trace);
    const grade = gradeFromAnswers(graded.result.answers as unknown as Answers, essay.text, thresholds);

    const rubric = Object.fromEntries(grade.criteria.map((r) => [r.id, r.status]));
    const misconceptionCriteria = (C1_QUESTIONS.misconception!.type === "choice" ? C1_QUESTIONS.misconception!.criteria : {}) as Record<string, string>;
    const rubricQuestions = Object.fromEntries(grade.criteria.map((r) => [r.id, String(C1_QUESTIONS[r.id]!.instructions)]));
    const { text: feedback, trace: ctrace } = await deps.claudeText({
      scenario: "c1",
      purpose: "student_feedback",
      tier: "standard",
      system: FEEDBACK_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ ASSIGNMENT_PROMPT: buildEssayState(essay).assignment.prompt, STUDENT_ANSWER: essay.text, RUBRIC_QUESTIONS: rubricQuestions, RUBRIC_RESULTS: rubric, MISCONCEPTION: grade.flags.find((f) => f.startsWith("misconception:"))?.slice("misconception:".length) ?? "none", MISCONCEPTION_MEANING: misconceptionCriteria[grade.flags.find((f) => f.startsWith("misconception:"))?.slice("misconception:".length) ?? "none"] ?? "No incorrect scientific claim", LEVEL_0_TO_3: Number(grade.level.toFixed(1)) }) }],
      maxTokens: 220,
      effort: "low",
    });
    usage.record(ctrace);
    traces.push(ctrace);

    const verified = await deps.askJev({ scenario: "c1", state: buildFeedbackState(essay, grade, feedback), questions: C1_FEEDBACK_QUESTIONS }, { cache: "read-only" });
    usage.record(verified.trace);
    traces.push(verified.trace);
    const v = verified.result.answers as unknown as Answers;
    const noul = (id: string): number => {
      const a = v[id];
      return a && a.type === "noul" ? a.noul : 0;
    };
    const entry: FeedbackCacheEntry = { feedback, grade, verification: { consistent: noul("feedback_consistent"), specific: noul("feedback_specific"), kind: noul("feedback_kind") }, traces };
    feedbackCache.set(key, entry);
    return c.json({ ...entry, cached: false });
  });

  return app;
}

export const c1Routes = createC1Routes({ askJev: defaultAskJev, claudeText: defaultClaudeText });
