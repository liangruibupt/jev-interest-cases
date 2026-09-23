import { C1_FEEDBACK_QUESTIONS, C1_QUESTIONS, ESSAYS, MISCONCEPTION_ZH, buildEssayState, buildFeedbackState, gradeFromAnswers, type Answers, type Grade, type JevTrace, type Trace } from "@jev/shared";
import { Hono } from "hono";
import { claudeText as defaultClaudeText } from "../lib/claude";
import { BadRequestError, apiErrorHandler } from "../lib/errors";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

export const FEEDBACK_SYSTEM =
  "You are a kind 8th-grade science teacher writing feedback to one student about their short answer. " +
  "Use RUBRIC_RESULTS exactly: praise only criteria marked met, point out what is missing for criteria marked missed, and gently correct the misconception if one is listed. " +
  "Never invent praise for something the student did not do. Address the student directly, 2 to 3 sentences, under 90 words, plain text.";

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
    const wanted = body.essayIds ?? ESSAYS.map((e) => e.id);
    const unknown = wanted.filter((id) => !ESSAYS.some((e) => e.id === id));
    if (unknown.length) throw new BadRequestError(`未知的作业 ID：${unknown.join(", ")}`, { unknown });
    const essays = ESSAYS.filter((e) => wanted.includes(e.id));
    const cache = body.live ? "off" : "read-write";
    const outcomes = await Promise.all(essays.map((e) => deps.askJev({ scenario: "c1", state: buildEssayState(e), questions: C1_QUESTIONS }, { cache })));
    const results: Record<string, { answers: Answers; traceId: string }> = {};
    const traces: JevTrace[] = [];
    outcomes.forEach((o, i) => {
      results[essays[i]!.id] = { answers: o.result.answers as unknown as Answers, traceId: o.trace.id };
      traces.push(o.trace);
      usage.record(o.trace);
    });
    return c.json({ results, traces, model: outcomes[0]?.trace.model ?? null });
  });

  app.post("/feedback", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { essayId?: unknown };
    const essay = ESSAYS.find((e) => e.id === body.essayId);
    if (!essay) throw new BadRequestError("未知的作业 ID", { essayId: body.essayId });
    const hit = feedbackCache.get(essay.id);
    if (hit) return c.json({ ...hit, traces: [], cached: true });

    const traces: Trace[] = [];
    const graded = await deps.askJev({ scenario: "c1", state: buildEssayState(essay), questions: C1_QUESTIONS }, { cache: "read-write" });
    usage.record(graded.trace);
    traces.push(graded.trace);
    const grade = gradeFromAnswers(graded.result.answers as unknown as Answers, essay.text);

    const rubric = Object.fromEntries(grade.criteria.map((r) => [r.id, r.status]));
    const { text: feedback, trace: ctrace } = await deps.claudeText({
      scenario: "c1",
      purpose: "student_feedback",
      tier: "standard",
      system: FEEDBACK_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ ASSIGNMENT_PROMPT: buildEssayState(essay).assignment.prompt, STUDENT_ANSWER: essay.text, RUBRIC_RESULTS: rubric, MISCONCEPTION: grade.misconception?.choice ?? "none", MISCONCEPTION_ZH: MISCONCEPTION_ZH[grade.misconception?.choice ?? "none"], LEVEL_0_TO_3: Number(grade.level.toFixed(1)) }) }],
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
    feedbackCache.set(essay.id, entry);
    return c.json({ ...entry, cached: false });
  });

  return app;
}

export const c1Routes = createC1Routes({ askJev: defaultAskJev, claudeText: defaultClaudeText });
