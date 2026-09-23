# P1 · A1 原语实验室 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the A1 Playground page: 7 English presets that teach the three primitives, a server route that evaluates arbitrary (bounded) questions, primitive visualizations (ProbBars / ScoreLine / NoulMeter / ConfidenceRing), live mode, savings card, inspector, learning card, smoke cases, and `docs/scenarios/A1.md`.

**Architecture:** Presets live in `shared/src/scenarios/a1-playground/presets.ts` (typed, validated by tests). The server exposes `POST /api/a1/evaluate` through a route factory that takes `askJev` as a dependency (testable without network). The page imports presets directly from `@jev/shared`, edits state/questions locally, calls the route, and renders answers with the dataviz specs (thin bars ≤ 24px, 4px rounded data-ends, single Jev hue with emphasis, text in ink tokens, hover titles).

**Tech Stack:** as P0. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-jev-lab-design.md` §4 A1; dataviz specs from the `dataviz` skill (marks-and-anatomy, choosing-a-form).

## Global Constraints

- Question text and demo data in English; UI copy in Chinese (`web/src/i18n/zh.ts`).
- A1 is the only endpoint that accepts client-defined questions: ≤ 12 questions, stringified state ≤ 12,000 chars, otherwise 400 `invalid_questions`.
- Live mode bypasses the cache (`cache: "off"`); normal runs use `read-write`.
- Colors: Jev marks `--color-jev`, de-emphasis `--color-rule`/`--color-paper-2`; never color text with the data hue.

---

### Task 1: shared — A1 presets

**Files:**
- Create: `shared/src/scenarios/a1-playground/presets.ts`
- Test: `shared/src/scenarios/a1-playground/presets.test.ts`
- Modify: `shared/src/index.ts` (add `export * from "./scenarios/a1-playground/presets";`)

**Interfaces:**
- Produces: `A1_PRESETS: A1Preset[]`, `A1_LIMITS = { maxQuestions: 12, maxStateChars: 12_000 }`, type `A1Preset { id, title_zh, lesson_zh, expect_zh, state, questions, summarize? }`, `summarizeNouls(answers, spec)`.

- [ ] **Step 1: Failing test** `presets.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { validateQuestions } from "../../validate";
import { A1_LIMITS, A1_PRESETS, summarizeNouls } from "./presets";

describe("A1 presets", () => {
  it("has 7 presets with unique ids that all validate and respect the limits", () => {
    expect(A1_PRESETS).toHaveLength(7);
    expect(new Set(A1_PRESETS.map((p) => p.id)).size).toBe(7);
    for (const p of A1_PRESETS) {
      expect(validateQuestions(p.questions), p.id).toEqual([]);
      expect(Object.keys(p.questions).length).toBeLessThanOrEqual(A1_LIMITS.maxQuestions);
      expect(JSON.stringify(p.state).length).toBeLessThanOrEqual(A1_LIMITS.maxStateChars);
    }
  });

  it("preset 4 asks one Noul per item and its summary counts nouls above the threshold", () => {
    const p = A1_PRESETS.find((x) => x.id === "counting")!;
    const nouls = Object.values(p.questions).filter((q) => q.type === "noul");
    expect(nouls).toHaveLength(8);
    expect(p.summarize?.kind).toBe("count_nouls_above");
    const answers = Object.fromEntries(p.summarize!.ids.map((id, i) => [id, { type: "noul" as const, noul: i % 3 === 1 ? 0.9 : 0.1 }]));
    expect(summarizeNouls(answers, p.summarize!)).toBe(3);
  });

  it("preset 7 is the Chinese twin of preset 1 with identical questions", () => {
    const en = A1_PRESETS.find((x) => x.id === "quickstart")!;
    const zh = A1_PRESETS.find((x) => x.id === "cjk")!;
    expect(zh.questions).toEqual(en.questions);
    expect(zh.state).not.toEqual(en.state);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run shared` → FAIL (module not found).

- [ ] **Step 3: Implement** `presets.ts`

```ts
import type { Answers, EntryType, Questions } from "../../types";

export const A1_LIMITS = { maxQuestions: 12, maxStateChars: 12_000 } as const;

export interface NoulSummary {
  kind: "count_nouls_above";
  threshold: number;
  ids: string[];
  label_zh: string;
}

export interface A1Preset {
  id: string;
  title_zh: string;
  /** What this preset teaches (shown in the learning card). */
  lesson_zh: string;
  /** What to look for in the answers. */
  expect_zh: string;
  state: EntryType;
  questions: Questions;
  summarize?: NoulSummary;
}

export function summarizeNouls(answers: Answers, spec: NoulSummary): number {
  return spec.ids.reduce((n, id) => {
    const a = answers[id];
    return n + (a && a.type === "noul" && a.noul > spec.threshold ? 1 : 0);
  }, 0);
}

const STRIPE_TICKET = "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.";

const QUICKSTART_QUESTIONS: Questions = {
  department: {
    type: "choice",
    instructions: "Which team should handle this",
    criteria: { billing: "Payment or subscription issues", technical: "Bugs or integration problems", sales: "Pricing or account questions" },
  },
  frustration: {
    type: "score",
    instructions: "How frustrated the customer appears",
    criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"],
  },
  is_urgent: { type: "noul", instructions: "The message conveys urgency or time-sensitivity" },
};

const FRUIT_ITEMS = ["typesafe", "apple", "california", "banana", "likes", "calibration", "orange", "vertex"];

export const A1_PRESETS: A1Preset[] = [
  {
    id: "quickstart",
    title_zh: "1 · 快速开始：三种原语各一题",
    lesson_zh: "一次请求同时问 Choice、Score、Noul。注意 Choice 返回整条概率分布而不只是一个标签；Score 的值可以落在两级之间；Noul 没有 confidence，它本身就是概率。",
    expect_zh: "department=technical（概率接近 1），is_urgent ≈ 0.98，frustration 约 0.5–1.0。",
    state: STRIPE_TICKET,
    questions: QUICKSTART_QUESTIONS,
  },
  {
    id: "structured-state",
    title_zh: "2 · 结构化 state 与反引号路径",
    lesson_zh: "把工单、订单、政策放进一个 JSON 对象，用反引号路径告诉 Jev 该看哪一段。两个问题互相独立、并行评估。",
    expect_zh: "refund_requested ≈ 0.9+；policy_supports_refund 也应很高，因为政策明确覆盖重复扣款。",
    state: {
      ticket: {
        subject: "Duplicate charge",
        messages: [
          { from: "customer", text: "I was charged twice for order A-104. Please refund the duplicate." },
          { from: "support", text: "We are checking the charges." },
        ],
      },
      order: { id: "A-104", charges: [{ amount_usd: 49, status: "captured" }, { amount_usd: 49, status: "captured" }] },
      refund_policy: "Duplicate charges are eligible for a refund.",
    },
    questions: {
      refund_requested: { type: "noul", instructions: "Does `ticket.messages[0].text` request a refund?" },
      policy_supports_refund: {
        type: "noul",
        instructions: "Does `refund_policy` support the refund requested in `ticket.messages[0].text`, given `order.charges`?",
      },
    },
  },
  {
    id: "literal",
    title_zh: "3 · 字面理解：正向问法 vs 反向问法",
    lesson_zh: "Jev 按你写的字面意思回答。让"高 = 是"的正向问法最稳；反向问法（free of…）需要模型做一次否定转换，而且两个答案并不保证相加为 1（没有结构不变量）。",
    expect_zh: "contains_personal_data 高（≈0.9+），free_of_personal_data 低；两者之和不一定等于 1。",
    state: "Hi, I'm Jane Doe. My phone number is 415-555-0134 and I'd like to update my shipping address to 22 Baker Street.",
    questions: {
      contains_personal_data: { type: "noul", instructions: "Does the message contain personal data such as a name, phone number, or address?" },
      free_of_personal_data: { type: "noul", instructions: "Is the message free of personal data?" },
    },
  },
  {
    id: "counting",
    title_zh: "4 · 不要让它数数",
    lesson_zh: "Jev 不是计算器。让它数满足条件的项（坏问法）会得到模糊分布；正确做法是每项问一个 Noul，让代码求和。8 个 Noul 与 1 个 Choice 在同一次请求里并行评估。",
    expect_zh: "how_many_fruits 的分布可能分散；8 个 item_* 里 apple / banana / orange 应接近 1，其余接近 0；代码求和 = 3。",
    state: { items: FRUIT_ITEMS },
    questions: {
      how_many_fruits: {
        type: "choice",
        instructions: "How many of the entries in `items` are the names of fruits?",
        criteria: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), null])),
      },
      ...Object.fromEntries(FRUIT_ITEMS.map((_, i) => [`item_${i}`, { type: "noul" as const, instructions: `Is \`items[${i}]\` the name of a fruit?` }])),
    },
    summarize: { kind: "count_nouls_above", threshold: 0.5, ids: FRUIT_ITEMS.map((_, i) => `item_${i}`), label_zh: "代码求和：Noul > 0.5 的项数" },
  },
  {
    id: "score-levels",
    title_zh: "5 · Score 级别：数字 vs 情境描述",
    lesson_zh: "每个等级是单独对照 state 判断的，模型看不到等级编号也看不到相邻等级。只写数字的等级没有可对照的内容，概率会在 0 和 1 之间摇摆；写清情境的等级会把概率集中到一级。",
    expect_zh: "severity_numeric 置信度低（约 0.3），severity_descriptive 应落在 0（Cosmetic）且置信度接近 1。",
    state: "The export button is misaligned by a few pixels on the settings page.",
    questions: {
      severity_numeric: { type: "score", instructions: "Rate severity from 0 to 2, where 2 is worst", criteria: ["0", "1", "2"] },
      severity_descriptive: {
        type: "score",
        instructions: "How severe is the reported issue?",
        criteria: ["Cosmetic; no impact to functionality", "Broken or degraded feature, but a workaround exists", "Blocking issue; no workaround exists"],
      },
    },
  },
  {
    id: "contrastive",
    title_zh: "6 · 对照式 criteria：what / not_for / examples",
    lesson_zh: "两个容易混淆的选项，用结构化对象说明各自覆盖什么、不覆盖什么、举例。字段名不是 API 保留字，模型能看到字段名与内容。对比同一问题的字符串版本。",
    expect_zh: "两版都应选 return_status；结构化版本的概率更集中、置信度更高。",
    state: "I sent the shoes back a week ago. When do I get my money?",
    questions: {
      return_topic_plain: {
        type: "choice",
        instructions: "Which returns topic is the customer asking about?",
        criteria: { return_policy: "Whether and how an item can be returned", return_status: "Progress of a return already sent" },
      },
      return_topic_structured: {
        type: "choice",
        instructions: { question: "Which returns topic is the customer asking about?", focus: "Classify the information the customer wants." },
        criteria: {
          return_policy: {
            what: "Whether and how an item can be returned",
            not_for: "Progress of a return already sent",
            examples: ["Can I return shoes I've worn once?", "How long do I have to return an order?"],
          },
          return_status: {
            what: "Progress of a return already sent",
            not_for: "Whether and how an item can be returned",
            examples: ["Has my return arrived yet?", "When will my refund be paid?"],
          },
        },
      },
    },
  },
  {
    id: "cjk",
    title_zh: "7 · 中文输入对照",
    lesson_zh: "Jev 以英文为主训练；中文可用但准确率与置信度会下降。这组用预置 1 的中文译文和完全相同的英文问题，对比概率分布的差异。",
    expect_zh: "结论方向通常一致，但概率更分散、置信度更低；这是选择英文演示数据的原因。",
    state: "你好，我已经尝试连接 Stripe 账户三天了，集成一直失败。我正在损失销售额。请尽快帮忙！",
    questions: QUICKSTART_QUESTIONS,
  },
];
```

- [ ] **Step 4: Export, run tests** (`npx vitest run shared`) → PASS. **Commit** `feat(shared): A1 playground presets`.

---

### Task 2: server — `/api/a1/evaluate`

**Files:**
- Create: `server/src/routes/a1.ts`
- Test: `server/src/routes/a1.test.ts`
- Modify: `server/src/app.ts` (mount `app.route("/api/a1", a1Routes)` before the static handler)

**Interfaces:**
- Produces: `createA1Routes(deps: { askJev })` → `Hono`; default `a1Routes`. Request `{ state, questions, live?: boolean }`; response `{ answers, model, usage, traces: JevTrace[] }`.

- [ ] **Step 1: Failing test** `a1.test.ts`

```ts
import type { JevTrace } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { createA1Routes } from "./a1";

const trace: JevTrace = {
  kind: "jev", id: "t1", scenario: "a1", startedAt: "", latencyMs: 120, cached: false, model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 300, output_tokens: 10 } },
  cost: { usd: 0.0000126 },
};

function build() {
  const askJev = vi.fn(async (_input: unknown, _opts: unknown) => ({ result: { model: trace.model, answers: trace.response.answers, usage: trace.response.usage }, trace }));
  return { app: createA1Routes({ askJev: askJev as never }), askJev };
}

const post = (app: ReturnType<typeof build>["app"], body: unknown) =>
  app.request("/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/a1/evaluate", () => {
  it("evaluates and returns answers plus traces; normal mode uses read-write cache", async () => {
    const { app, askJev } = build();
    const res = await post(app, { state: "s", questions: { q: { type: "noul", instructions: "?" } } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answers: { q: { noul: number } }; traces: unknown[]; model: string };
    expect(body.answers.q.noul).toBe(0.9);
    expect(body.traces).toHaveLength(1);
    expect(body.model).toBe("jev-1.13.0");
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "read-write" });
  });

  it("live mode bypasses the cache", async () => {
    const { app, askJev } = build();
    await post(app, { state: "s", questions: { q: { type: "noul", instructions: "?" } }, live: true });
    expect(askJev.mock.calls[0]?.[1]).toEqual({ cache: "off" });
  });

  it("rejects too many questions or an oversized state with 400", async () => {
    const { app, askJev } = build();
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`q${i}`, { type: "noul", instructions: "?" }]));
    expect((await post(app, { state: "s", questions: many })).status).toBe(400);
    expect((await post(app, { state: "x".repeat(12_001), questions: { q: { type: "noul", instructions: "?" } } })).status).toBe(400);
    expect(askJev).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `a1.ts`

```ts
import { A1_LIMITS, QuestionValidationError, type EntryType, type Questions } from "@jev/shared";
import { Hono } from "hono";
import { askJev as defaultAskJev } from "../lib/jev";
import { usage } from "../lib/usage";

interface EvaluateBody {
  state: EntryType;
  questions: Questions;
  live?: boolean;
}

export function createA1Routes(deps: { askJev: typeof defaultAskJev }) {
  const app = new Hono();

  app.post("/evaluate", async (c) => {
    const body = (await c.req.json()) as EvaluateBody;
    const n = Object.keys(body.questions ?? {}).length;
    if (n > A1_LIMITS.maxQuestions) {
      throw new QuestionValidationError([{ questionId: "", message: `最多 ${A1_LIMITS.maxQuestions} 个问题，当前 ${n}` }]);
    }
    const stateChars = typeof body.state === "string" ? body.state.length : JSON.stringify(body.state ?? null).length;
    if (stateChars > A1_LIMITS.maxStateChars) {
      throw new QuestionValidationError([{ questionId: "", message: `state 最多 ${A1_LIMITS.maxStateChars} 字符，当前 ${stateChars}` }]);
    }
    const { result, trace } = await deps.askJev(
      { scenario: "a1", state: body.state, questions: body.questions },
      { cache: body.live ? "off" : "read-write" },
    );
    usage.record(trace);
    return c.json({ answers: result.answers, model: result.model, usage: result.usage, traces: [trace] });
  });

  return app;
}

export const a1Routes = createA1Routes({ askJev: defaultAskJev });
```

`app.ts`: `import { a1Routes } from "./routes/a1";` and `app.route("/api/a1", a1Routes);` above the static handler. Note: `app.onError` in `app.ts` still catches errors thrown inside the sub-app because Hono propagates them to the parent.

- [ ] **Step 4: Run** `npx vitest run server && npm run typecheck -w @jev/server` → PASS. **Commit** `feat(server): A1 evaluate route`.

---

### Task 3: web — primitive visualizations

**Files:**
- Create: `web/src/components/ProbBars.tsx`, `web/src/components/ScoreLine.tsx`, `web/src/components/NoulMeter.tsx`, `web/src/components/ConfidenceRing.tsx`, `web/src/components/AnswerCard.tsx`

**Interfaces:**
- `ProbBars({ probabilities, chosen })` — horizontal bars sorted desc, chosen in `--color-jev`, others in `--color-rule`; value at tip; `title` hover.
- `ScoreLine({ score, legend, probabilities })` — level bars (one per level, same emphasis rule for argmax) plus a number line 0..n-1 with the expected-value marker.
- `NoulMeter({ value, no = 0.2, yes = 0.8 })` — meter: light Jev track, Jev fill to `value`, hairline zone markers at `no`/`yes`, zone label (否 / 不确定 / 是).
- `ConfidenceRing({ value })` — SVG ring, ink text.
- `AnswerCard({ id, question, answer })` — dispatches by `answer.type`, shows the instructions text and the returned JSON on demand.

- [ ] **Step 1: Implement**

```tsx
// ProbBars.tsx
export function ProbBars({ probabilities, chosen }: { probabilities: Record<string, number>; chosen?: string }) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, p]) => (
        <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm" title={`${label}: ${(p * 100).toFixed(1)}%`}>
          <span className={`truncate ${label === chosen ? "font-medium text-ink" : "text-ink-2"}`}>{label}</span>
          <span className="relative h-3 rounded-r-[4px] bg-paper-2">
            <span
              className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300 ${label === chosen ? "bg-jev" : "bg-rule"}`}
              style={{ width: `${Math.max(0, Math.min(100, p * 100))}%` }}
            />
          </span>
          <span className="num text-right text-xs text-ink-2">{(p * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// ScoreLine.tsx
export function ScoreLine({ score, legend, probabilities }: { score: number; legend: Record<string, unknown>; probabilities: Record<string, number> }) {
  const levels = Object.keys(legend).map(Number).sort((a, b) => a - b);
  const top = levels.length - 1;
  const argmax = levels.reduce((a, b) => ((probabilities[String(a)] ?? 0) >= (probabilities[String(b)] ?? 0) ? a : b));
  const describe = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div>
      <ul className="space-y-1.5">
        {levels.map((lv) => {
          const p = probabilities[String(lv)] ?? 0;
          return (
            <li key={lv} className="grid grid-cols-[1.25rem_minmax(0,1fr)_6rem_3.5rem] items-center gap-3 text-sm" title={`${lv}: ${(p * 100).toFixed(1)}%`}>
              <span className="num text-xs text-ink-3">{lv}</span>
              <span className={`truncate ${lv === argmax ? "text-ink" : "text-ink-2"}`}>{describe(legend[String(lv)])}</span>
              <span className="relative h-3 rounded-r-[4px] bg-paper-2">
                <span className={`absolute inset-y-0 left-0 rounded-r-[4px] ${lv === argmax ? "bg-jev" : "bg-rule"}`} style={{ width: `${p * 100}%` }} />
              </span>
              <span className="num text-right text-xs text-ink-2">{(p * 100).toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-3 h-px bg-rule" />
          {levels.map((lv) => (
            <div key={lv} className="absolute top-2 h-3 w-px bg-rule" style={{ left: `${(lv / Math.max(top, 1)) * 100}%` }} />
          ))}
          <div className="absolute top-1 h-5 w-0.5 -translate-x-1/2 bg-jev" style={{ left: `${(score / Math.max(top, 1)) * 100}%` }} title={`score = ${score.toFixed(2)}`} />
        </div>
        <div className="num flex justify-between text-[10px] text-ink-3">
          <span>0</span>
          <span>score = {score.toFixed(2)}</span>
          <span>{top}</span>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// NoulMeter.tsx
export function NoulMeter({ value, no = 0.2, yes = 0.8 }: { value: number; no?: number; yes?: number }) {
  const zone = value >= yes ? "是" : value <= no ? "否" : "不确定";
  return (
    <div title={`noul = ${value.toFixed(3)}`}>
      <div className="flex items-baseline justify-between">
        <span className="num text-2xl text-ink">{value.toFixed(2)}</span>
        <span className="text-xs text-ink-2">{zone}（NO ≤ {no} · YES ≥ {yes}）</span>
      </div>
      <div className="relative mt-2 h-3 rounded-[4px] bg-jev-soft">
        <div className="absolute inset-y-0 left-0 rounded-[4px] bg-jev transition-[width] duration-300" style={{ width: `${value * 100}%` }} />
        <div className="absolute -top-1 h-5 w-px bg-ink-3" style={{ left: `${no * 100}%` }} />
        <div className="absolute -top-1 h-5 w-px bg-ink-3" style={{ left: `${yes * 100}%` }} />
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-ink-3">
        <span>0 否</span>
        <span>0.5</span>
        <span>是 1</span>
      </div>
    </div>
  );
}
```

```tsx
// ConfidenceRing.tsx
export function ConfidenceRing({ value }: { value: number | null }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2" title={value === null ? "LLM 适配器不提供 confidence" : `confidence = ${v.toFixed(3)}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-jev)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <div className="leading-tight">
        <div className="num text-sm text-ink">{value === null ? "—" : v.toFixed(2)}</div>
        <div className="text-[10px] text-ink-3">confidence</div>
      </div>
    </div>
  );
}
```

```tsx
// AnswerCard.tsx
import type { AnyAnswer, Question } from "@jev/shared";
import { useState } from "react";
import { ConfidenceRing } from "./ConfidenceRing";
import { NoulMeter } from "./NoulMeter";
import { ProbBars } from "./ProbBars";
import { ScoreLine } from "./ScoreLine";

export function AnswerCard({ id, question, answer }: { id: string; question: Question; answer: AnyAnswer }) {
  const [showJson, setShowJson] = useState(false);
  const instructions = typeof question.instructions === "string" ? question.instructions : JSON.stringify(question.instructions);
  return (
    <section className="hairline rise rounded-md bg-panel p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white ${answer.type === "choice" ? "bg-jev" : answer.type === "score" ? "bg-ink-2" : "bg-ink-3"}`}>{answer.type}</span>
            <span className="num text-xs text-ink-3">{id}</span>
          </div>
          <p className="mt-1 text-sm text-ink-2">{instructions}</p>
        </div>
        {answer.type !== "noul" && <ConfidenceRing value={answer.confidence} />}
      </header>
      <div className="mt-3">
        {answer.type === "choice" && (
          <>
            <div className="mb-2 text-sm">
              选中：<span className="font-medium">{answer.choice}</span>
            </div>
            <ProbBars probabilities={answer.probabilities} chosen={answer.choice} />
          </>
        )}
        {answer.type === "score" && <ScoreLine score={answer.score} legend={answer.legend as Record<string, unknown>} probabilities={answer.probabilities as Record<string, number>} />}
        {answer.type === "noul" && <NoulMeter value={answer.noul} />}
      </div>
      <button type="button" className="mt-3 text-[11px] text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink" onClick={() => setShowJson(!showJson)}>
        {showJson ? "收起返回 JSON" : "查看返回 JSON"}
      </button>
      {showJson && <pre className="num mt-2 max-h-56 overflow-auto rounded-sm bg-ink p-3 text-[11px] leading-snug text-paper">{JSON.stringify(answer, null, 2)}</pre>}
    </section>
  );
}
```

- [ ] **Step 2:** `npm run typecheck -w @jev/web` → PASS. **Commit** `feat(web): primitive visualizations`.

---

### Task 4: web — A1 page

**Files:**
- Create: `web/src/pages/A1Playground.tsx`, `web/src/components/QuestionEditor.tsx`
- Modify: `web/src/App.tsx` (route `/a1` → `A1Playground` before `:id`), `web/src/app/scenarios.ts` (a1 `status: "available"`), `web/src/i18n/zh.ts` (a1 strings)

**Behaviour:**
- Left column: preset list (7 buttons; selecting resets state + questions + clears answers); state editor (textarea; JSON is auto-detected: if it parses as JSON object/array it is sent as such, else as string; a chip shows "JSON 对象" / "字符串"); `QuestionEditor` — one card per question with id, type select, instructions textarea, criteria textarea (JSON; Choice map / Score array / Noul optional), remove button, "添加问题"; validation issues from `validateQuestions` shown inline; "查看请求 JSON" toggle showing the exact `{state, questions}`.
- Toolbar: 评估 button; "实时模式" switch — when on, re-evaluate 400 ms after the last state edit (cache off); shows ✓/✗ status and the error toast text.
- Right column: `AnswerCard` per question in question order; if the preset has `summarize`, a line "代码求和：Noul > 0.5 的项数 = N"; footer chips model / latency / tokens / cost; `SavingsCard scenario="a1"` over the page's Jev traces; `RequestInspector`; `LearningCard` fed by preset `lesson_zh` + page-level proves/tryThis/pitfalls.
- All traces also pushed to the session store (`addTraces`).

- [ ] **Step 1: Implement** (code in the executor's discretion following P0 conventions; must use `api.post<A1Response>("/api/a1/evaluate", { state, questions, live })`, `validateQuestions`, `A1_PRESETS`, `summarizeNouls`, `useSession().addTraces`).
- [ ] **Step 2:** typecheck; `npm run dev`; Playwright: open `/a1`, select preset 1, click 评估, wait for three AnswerCards, screenshot `docs/screenshots/a1-quickstart.png`; select preset 4, evaluate, confirm "= 3" appears; select preset 5, evaluate, screenshot `docs/screenshots/a1-score-levels.png`. No console errors.
- [ ] **Step 3: Commit** `feat(web): A1 playground page`.

---

### Task 5: smoke, docs, gate

**Files:**
- Create: `scripts/smokes/a1.ts`; Modify: `scripts/smoke.ts` (register `a1`)
- Create: `docs/scenarios/A1.md`; Modify: `docs/scenarios/README.md` (link), `README.md` (A1 status)

- [ ] **Step 1: smoke** — run presets `quickstart`, `literal`, `counting`, `score-levels`, `contrastive`, `cjk` with `cache: "off"`, print a table per preset (question / answer / confidence), and assert: quickstart `is_urgent > 0.8` and `department = technical`; literal `contains_personal_data > 0.7`; counting summary `=== 3`; score-levels descriptive confidence > numeric confidence; contrastive both choose `return_status`. Print latency/tokens/cost per preset. Exit non-zero on failed assertions but still print everything.
- [ ] **Step 2: docs/scenarios/A1.md** — goal, the 7 presets (English question text + Chinese lesson), the visual encoding rules used (emphasis bars, meter, ring), measured table from the smoke run (answers, confidence, latency, tokens, cost), savings-card numbers for preset 1, "试一试" list (edit a level description; invert a Noul; paste your own ticket; try Chinese), pitfalls.
- [ ] **Step 3: gate** — `npm test`, `npm run typecheck`, `npm run smoke -- a1` green; screenshots saved; `server/.cache/jev/*.json` for the presets committed (normal-mode runs write them). Commit `feat: A1 playground smoke and docs`.
