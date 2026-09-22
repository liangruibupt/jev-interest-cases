# Jev Lab P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Jev Lab monorepo foundation: shared types/pricing/cost model, server wrappers for Jev (TypeSafe) and Claude (Bedrock runtime), an LLM-backed System One adapter, a Hono API with health/usage, a Vite+React shell with inspector/cost/savings widgets, env/smoke scripts, and the Chinese teaching docs 00–05.

**Architecture:** npm workspaces with three packages. `shared/` holds every question, threshold, pricing constant, and pure composition/cost function (importable by both server and web). `server/` (Hono) is the only process holding secrets and wraps the two model SDKs with tracing, caching, queuing, and error mapping. `web/` (Vite + React + Tailwind 4) renders scenario pages and shared widgets and talks only to `/api/*`.

**Tech Stack:** Node 22.17, npm 11 workspaces, TypeScript 5 (strict, ESM, `moduleResolution: bundler`), vitest 5, tsx 4, Hono 4 + `@hono/node-server`, `@typesafe-ai/sdk` 0.6, `@anthropic-ai/bedrock-sdk` 0.33 + `@anthropic-ai/sdk` 0.127, zod 4, p-limit 7, Vite 8, React 19, react-router 7, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-22-jev-lab-design.md`

## Global Constraints

- Claude goes through **Bedrock runtime** (`AnthropicBedrock`, `bedrock-runtime` InvokeModel) with inference-profile IDs: `global.anthropic.claude-sonnet-5`, `global.anthropic.claude-opus-5`, `global.anthropic.claude-sonnet-4-6`, `global.anthropic.claude-opus-4-6-v1`, `global.anthropic.claude-fable-5-1`; Haiku (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) exists but is `enabledByDefault: false`.
- Claude 5 family (Sonnet 5, Opus 5, Fable 5.1) rejects `temperature`; 4.6 family accepts it. Never send `budget_tokens`.
- Jev pricing: `$0.042` per 1M input tokens, output free. Claude list prices ($/Mtok in/out): Sonnet 5 2/10, Opus 5 5/25, Sonnet 4.6 3/15, Opus 4.6 5/25, Fable 5.1 10/50, Haiku 4.5 1/5.
- Questions/thresholds/pricing/cost model live only in `shared/src`. Server routes orchestrate; web renders.
- UI strings and docs are Chinese; question text and demo data are English.
- Secrets only in root `.env` (gitignored). `server/.cache/jev/` **is committed**.
- ESM everywhere: no `__dirname`; use `fileURLToPath(new URL(..., import.meta.url))`.
- Every task ends with `npm test` (vitest) green for the touched package and a commit.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/index.ts` (placeholder, replaced in Task 12)
- Create: `web/package.json`, `web/tsconfig.json` (filled in Task 15)

**Interfaces:**
- Produces: workspace names `@jev/shared`, `@jev/server`, `@jev/web`; root scripts `dev`, `test`, `typecheck`, `smoke`, `check-env`, `vendor`, `cache:clear`.

- [ ] **Step 1: Root package.json**

```json
{
  "name": "jev-lab",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm run dev -w @jev/server\" \"npm run dev -w @jev/web\"",
    "build": "npm run build -w @jev/web",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "check-env": "tsx --env-file=.env scripts/check-env.ts",
    "smoke": "tsx --env-file=.env scripts/smoke.ts",
    "vendor": "tsx scripts/vendor-datasets.ts",
    "cache:clear": "rm -f server/.cache/jev/*.json"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "concurrently": "^10.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vitest": "^5.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 3: vitest.config.ts, .gitignore, .env.example**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["shared", "server"],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
.DS_Store
docs/screenshots/*.tmp.png
```

`.env.example`:
```
# TypeSafe (Jev) — https://console.typesafe.ai/keys
TYPESAFE_API_KEY=
# Optional: pin a Jev version instead of jev-latest
# JEV_MODEL=jev-1.13.0
# Jev response cache: read-write | read-only | off  (A4 always bypasses)
JEV_CACHE=read-write
JEV_CONCURRENCY=6

# Claude via AWS Bedrock runtime (inference-profile IDs live in shared/src/pricing.ts)
AWS_PROFILE=global_ruiliang
AWS_REGION=us-east-1
CLAUDE_CONCURRENCY=3

PORT=8787
```

- [ ] **Step 4: shared package**

`shared/package.json`:
```json
{
  "name": "@jev/shared",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@typesafe-ai/sdk": "^0.6.0"
  }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`shared/src/index.ts` (start empty; each task appends its exports):
```ts
export {};
```

- [ ] **Step 5: server package**

`server/package.json`:
```json
{
  "name": "@jev/server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=../.env src/index.ts",
    "start": "tsx --env-file=../.env src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/bedrock-sdk": "^0.33.0",
    "@anthropic-ai/sdk": "^0.127.0",
    "@hono/node-server": "^2.1.0",
    "@jev/shared": "*",
    "@typesafe-ai/sdk": "^0.6.0",
    "hono": "^4.13.0",
    "p-limit": "^7.3.0",
    "zod": "^4.6.0"
  }
}
```

`server/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`server/src/index.ts` placeholder:
```ts
console.log("server placeholder");
```

- [ ] **Step 6: web package skeleton (deps only; sources in Task 15)**

`web/package.json`:
```json
{
  "name": "@jev/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@jev/shared": "*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.9.0",
    "recharts": "^3.10.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.1.0",
    "tailwindcss": "^4.3.0",
    "vite": "^8.3.0"
  }
}
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Install and verify**

Run: `npm install`
Expected: lockfile created, `node_modules/@jev/shared` is a symlink to `shared/`.

Run: `npm run typecheck`
Expected: passes (web has no sources yet; `tsc --noEmit` on an empty include may warn "No inputs were found" — if it errors, add `web/src/main.tsx` placeholder `export {};` now).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces (shared, server, web)"
```

---

### Task 2: shared — pricing and trace types

**Files:**
- Create: `shared/src/pricing.ts`, `shared/src/types.ts`
- Test: `shared/src/pricing.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `JEV_USD_PER_MTOK_INPUT`, `CLAUDE_TIERS: Record<ClaudeTierId, ClaudeTier>`, `jevCostUsd(inputTokens, outputTokens?)`, `claudeCostUsd(tier, inputTokens, outputTokens)`; types `ScenarioId`, `JevTrace`, `ClaudeTrace`, `Trace`, `Answers`, `AnyAnswer`, `BaselineEstimate`.

- [ ] **Step 1: Write the failing test** `shared/src/pricing.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CLAUDE_TIERS, claudeCostUsd, jevCostUsd } from "./pricing";

describe("pricing", () => {
  it("prices Jev input at $0.042 per million tokens and output free", () => {
    expect(jevCostUsd(1_000_000)).toBeCloseTo(0.042, 6);
    expect(jevCostUsd(1_000_000, 5_000_000)).toBeCloseTo(0.042, 6);
    expect(jevCostUsd(0)).toBe(0);
  });

  it("prices Claude tiers from the table", () => {
    expect(claudeCostUsd("standard", 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
    expect(claudeCostUsd("strong", 1_000_000, 0)).toBeCloseTo(5, 6);
    expect(claudeCostUsd("prev_sonnet", 0, 1_000_000)).toBeCloseTo(15, 6);
  });

  it("marks only the 4.6 family as supporting temperature and haiku as disabled", () => {
    expect(CLAUDE_TIERS.prev_sonnet.supportsTemperature).toBe(true);
    expect(CLAUDE_TIERS.standard.supportsTemperature).toBe(false);
    expect(CLAUDE_TIERS.haiku.enabledByDefault).toBe(false);
    expect(CLAUDE_TIERS.standard.modelId).toBe("global.anthropic.claude-sonnet-5");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run shared/src/pricing.test.ts`
Expected: FAIL — cannot find module `./pricing`.

- [ ] **Step 3: Implement** `shared/src/pricing.ts`

```ts
/** Jev (TypeSafe) list price: charged per input token, output free. Source: https://docs.typesafe.ai/models */
export const JEV_USD_PER_MTOK_INPUT = 0.042;
export const JEV_USD_PER_MTOK_OUTPUT = 0;

export type ClaudeTierId = "standard" | "strong" | "prev_sonnet" | "prev_opus" | "frontier" | "haiku";

export interface ClaudeTier {
  id: ClaudeTierId;
  /** Bedrock inference-profile ID (runtime endpoint). */
  modelId: string;
  label: string;
  inUsdPerMtok: number;
  outUsdPerMtok: number;
  /** Claude 4.6 family accepts `temperature`; the 5 family rejects it (400). */
  supportsTemperature: boolean;
  /** `output_config.effort` supported (all 4.6+ models; not Haiku 4.5). */
  supportsEffort: boolean;
  enabledByDefault: boolean;
  role_zh: string;
}

/** Single source of truth for Claude model IDs and list prices ($ per 1M tokens). */
export const CLAUDE_TIERS: Record<ClaudeTierId, ClaudeTier> = {
  standard: {
    id: "standard",
    modelId: "global.anthropic.claude-sonnet-5",
    label: "Claude Sonnet 5",
    inUsdPerMtok: 2,
    outUsdPerMtok: 10,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "默认生成模型；B1 中档；B4 拆分与闲聊",
  },
  strong: {
    id: "strong",
    modelId: "global.anthropic.claude-opus-5",
    label: "Claude Opus 5",
    inUsdPerMtok: 5,
    outUsdPerMtok: 25,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "高复杂度路由；B2/B3 可选生成层；A4 对照",
  },
  prev_sonnet: {
    id: "prev_sonnet",
    modelId: "global.anthropic.claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    inUsdPerMtok: 3,
    outUsdPerMtok: 15,
    supportsTemperature: true,
    supportsEffort: true,
    enabledByDefault: true,
    role_zh: "上一代对照（可设 temperature）",
  },
  prev_opus: {
    id: "prev_opus",
    modelId: "global.anthropic.claude-opus-4-6-v1",
    label: "Claude Opus 4.6",
    inUsdPerMtok: 5,
    outUsdPerMtok: 25,
    supportsTemperature: true,
    supportsEffort: true,
    enabledByDefault: false,
    role_zh: "上一代对照（可选）",
  },
  frontier: {
    id: "frontier",
    modelId: "global.anthropic.claude-fable-5-1",
    label: "Claude Fable 5.1",
    inUsdPerMtok: 10,
    outUsdPerMtok: 50,
    supportsTemperature: false,
    supportsEffort: true,
    enabledByDefault: false,
    role_zh: "可选前沿层；成本基线上限",
  },
  haiku: {
    id: "haiku",
    modelId: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "Claude Haiku 4.5",
    inUsdPerMtok: 1,
    outUsdPerMtok: 5,
    supportsTemperature: true,
    supportsEffort: false,
    enabledByDefault: false,
    role_zh: "仅用于复现官方 cookbook 数字",
  },
};

export const CLAUDE_TIER_IDS = Object.keys(CLAUDE_TIERS) as ClaudeTierId[];

export function jevCostUsd(inputTokens: number, outputTokens = 0): number {
  return (inputTokens / 1e6) * JEV_USD_PER_MTOK_INPUT + (outputTokens / 1e6) * JEV_USD_PER_MTOK_OUTPUT;
}

export function claudeCostUsd(tier: ClaudeTierId, inputTokens: number, outputTokens: number): number {
  const t = CLAUDE_TIERS[tier];
  return (inputTokens / 1e6) * t.inUsdPerMtok + (outputTokens / 1e6) * t.outUsdPerMtok;
}
```

- [ ] **Step 4: Implement** `shared/src/types.ts`

```ts
import type {
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import type { ClaudeTierId } from "./pricing";

export type {
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
};

/**
 * Answers as stored in traces. Same shape as the SDK responses except that `confidence`
 * may be `null` for answers produced by the LLM adapter (Jev's confidence formula is
 * unpublished, so the adapter does not fabricate one).
 */
export type ChoiceAnswer = Omit<ChoiceResponse, "confidence"> & { confidence: number | null };
export type ScoreAnswer = Omit<ScoreResponse, "confidence"> & { confidence: number | null };
export type NoulAnswer = NoulResponse;
export type AnyAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;
export type Answers = Record<string, AnyAnswer>;

export type ScenarioId = "p0" | "a1" | "a2" | "a3" | "a4" | "b1" | "b2" | "b3" | "b4";

export interface JevTrace {
  kind: "jev";
  id: string;
  scenario: ScenarioId;
  startedAt: string;
  /** Wall-clock latency of the real call; 0 when served from cache. */
  latencyMs: number;
  cached: boolean;
  /** Latency of the original call when this trace was served from cache. */
  originalLatencyMs?: number;
  /** Versioned model that answered, e.g. "jev-1.13.0". */
  model: string;
  request: { state: EntryType; questions: Questions; model: string };
  response: { answers: Answers; usage: { input_tokens: number; output_tokens: number } };
  /** Money actually spent by this call (0 when cached). */
  cost: { usd: number };
}

export interface ClaudeTrace {
  kind: "claude";
  id: string;
  scenario: ScenarioId;
  /** Free-text tag such as "generate_answer" or "llmSystemOne". */
  purpose: string;
  startedAt: string;
  latencyMs: number;
  tier: ClaudeTierId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: { usd: number };
  stopReason: string | null;
}

export type Trace = JevTrace | ClaudeTrace;

export interface BaselineEstimate {
  scenario: ScenarioId;
  tier: ClaudeTierId;
  tierLabel: string;
  calls: number;
  inputTokens: number;
  /** Assumed LLM output tokens (Jev's output is free, an LLM must generate JSON/text). */
  outputTokens: number;
  /** What the same work would cost on the LLM tier. */
  llmUsd: number;
  /** What Jev costs for the same tokens (computed from tokens, so cached replays still compare fairly). */
  jevUsd: number;
  /** llmUsd / jevUsd; null when jevUsd is 0. */
  ratio: number | null;
  /** (1 - jevUsd / llmUsd) * 100 */
  savingsPct: number;
  assumption: { title_zh: string; outputTokensPerCall: number; note_zh: string };
}
```

- [ ] **Step 5: Export from** `shared/src/index.ts`

```ts
export * from "./pricing";
export * from "./types";
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run shared/src/pricing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add shared/src
git commit -m "feat(shared): pricing table and trace types"
```

---

### Task 3: shared — question validation and utilities

**Files:**
- Create: `shared/src/validate.ts`, `shared/src/util/stableStringify.ts`, `shared/src/util/normalizeText.ts`
- Test: `shared/src/validate.test.ts`, `shared/src/util/stableStringify.test.ts`, `shared/src/util/normalizeText.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `validateQuestions(questions): ValidationIssue[]`, `assertValidQuestions(questions): void` (throws `QuestionValidationError` with `.issues`), `stableStringify(value): string`, `normalizeText(s): string`.

- [ ] **Step 1: Write failing tests**

`shared/src/validate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Questions } from "./types";
import { QuestionValidationError, assertValidQuestions, validateQuestions } from "./validate";

const valid: Questions = {
  dept: { type: "choice", instructions: "Which team?", criteria: { billing: null, tech: null } },
  sev: { type: "score", instructions: "How severe?", criteria: ["Cosmetic", "Degraded", "Blocking"] },
  urgent: { type: "noul", instructions: "Is it urgent?" },
};

describe("validateQuestions", () => {
  it("accepts a valid mixed set", () => {
    expect(validateQuestions(valid)).toEqual([]);
    expect(() => assertValidQuestions(valid)).not.toThrow();
  });

  it("rejects an empty question map", () => {
    expect(validateQuestions({})[0]?.message).toMatch(/至少/);
  });

  it("rejects a Choice with fewer than 2 or more than 255 options", () => {
    const one: Questions = { q: { type: "choice", instructions: "?", criteria: { a: null } } };
    expect(validateQuestions(one)).toHaveLength(1);
    const many = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, null]));
    const tooMany: Questions = { q: { type: "choice", instructions: "?", criteria: many } };
    expect(validateQuestions(tooMany)[0]?.message).toMatch(/255/);
  });

  it("rejects a Score with fewer than 2 or more than 10 levels", () => {
    const one = { q: { type: "score", instructions: "?", criteria: ["only"] } } as unknown as Questions;
    expect(validateQuestions(one)).toHaveLength(1);
    const eleven = { q: { type: "score", instructions: "?", criteria: Array.from({ length: 11 }, (_, i) => `L${i}`) } } as unknown as Questions;
    expect(validateQuestions(eleven)[0]?.message).toMatch(/10/);
  });

  it("rejects unknown types and blank ids", () => {
    const bad = { " ": { type: "vibe", instructions: "?" } } as unknown as Questions;
    const issues = validateQuestions(bad);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/ID/);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/type/);
  });

  it("assertValidQuestions throws a typed error listing issues", () => {
    expect(() => assertValidQuestions({})).toThrow(QuestionValidationError);
    try {
      assertValidQuestions({});
    } catch (e) {
      expect((e as QuestionValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});
```

`shared/src/util/stableStringify.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { stableStringify } from "./stableStringify";

describe("stableStringify", () => {
  it("is independent of key insertion order, recursively", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });
  it("preserves array order and primitives", () => {
    expect(stableStringify([2, 1, "x", null, true])).toBe('[2,1,"x",null,true]');
  });
});
```

`shared/src/util/normalizeText.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalizeText";

describe("normalizeText", () => {
  it("folds curly quotes, dashes, whitespace and case", () => {
    expect(normalizeText("  The “exp” claim — is\n OPTIONAL. ")).toBe('the "exp" claim - is optional.');
    expect(normalizeText("it’s")).toBe("it's");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run shared`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`shared/src/validate.ts`:
```ts
import type { Questions } from "./types";

export const MAX_CHOICE_OPTIONS = 255;
export const MIN_CHOICE_OPTIONS = 2;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

export interface ValidationIssue {
  questionId: string;
  message: string;
}

export class QuestionValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map((i) => (i.questionId ? `${i.questionId}: ${i.message}` : i.message)).join("; "));
    this.name = "QuestionValidationError";
    this.issues = issues;
  }
}

/** Client-side checks mirroring the API limits so a 422 from Jev is always a real bug. */
export function validateQuestions(questions: Questions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entries = Object.entries(questions ?? {});
  if (entries.length === 0) {
    issues.push({ questionId: "", message: "至少需要一个问题" });
    return issues;
  }
  for (const [id, q] of entries) {
    if (!id.trim()) issues.push({ questionId: id, message: "问题 ID 不能为空" });
    if (!q || typeof q !== "object" || !("type" in q)) {
      issues.push({ questionId: id, message: "缺少 type 字段" });
      continue;
    }
    switch (q.type) {
      case "choice": {
        const n = Object.keys(q.criteria ?? {}).length;
        if (n < MIN_CHOICE_OPTIONS) issues.push({ questionId: id, message: `Choice 至少需要 ${MIN_CHOICE_OPTIONS} 个选项` });
        if (n > MAX_CHOICE_OPTIONS) issues.push({ questionId: id, message: `Choice 最多 ${MAX_CHOICE_OPTIONS} 个选项，当前 ${n}` });
        break;
      }
      case "score": {
        const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
        if (n < MIN_SCORE_LEVELS) issues.push({ questionId: id, message: `Score 至少需要 ${MIN_SCORE_LEVELS} 个等级` });
        if (n > MAX_SCORE_LEVELS) issues.push({ questionId: id, message: `Score 最多 ${MAX_SCORE_LEVELS} 个等级，当前 ${n}` });
        break;
      }
      case "noul":
        break;
      default:
        issues.push({ questionId: id, message: `未知的 type：${String((q as { type: unknown }).type)}` });
    }
  }
  return issues;
}

export function assertValidQuestions(questions: Questions): void {
  const issues = validateQuestions(questions);
  if (issues.length > 0) throw new QuestionValidationError(issues);
}
```

`shared/src/util/stableStringify.ts`:
```ts
/** JSON.stringify with object keys sorted recursively, for cache keys and hashing. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((k) => [k, sortKeys(record[k])]),
    );
  }
  return value;
}
```

`shared/src/util/normalizeText.ts`:
```ts
/** Fold typography and whitespace so quotes can be matched against source text. */
export function normalizeText(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
```

Append to `shared/src/index.ts`:
```ts
export * from "./validate";
export * from "./util/stableStringify";
export * from "./util/normalizeText";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src
git commit -m "feat(shared): question validation and text utilities"
```

---

### Task 4: shared — cost model (LLM baseline estimate)

**Files:**
- Create: `shared/src/costModel.ts`
- Test: `shared/src/costModel.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: `jevCostUsd`, `claudeCostUsd`, `CLAUDE_TIERS`, `JevTrace`, `BaselineEstimate`.
- Produces: `BASELINE_ASSUMPTIONS`, `estimateLlmBaseline(scenario, jevTraces, tier = "standard"): BaselineEstimate`.

- [ ] **Step 1: Write the failing test** `shared/src/costModel.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { estimateLlmBaseline } from "./costModel";
import type { JevTrace } from "./types";

const trace = (inputTokens: number, cached = false): JevTrace => ({
  kind: "jev",
  id: "t",
  scenario: "a2",
  startedAt: "2026-09-23T00:00:00Z",
  latencyMs: cached ? 0 : 120,
  cached,
  model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: inputTokens, output_tokens: 10 } },
  cost: { usd: cached ? 0 : (inputTokens / 1e6) * 0.042 },
});

describe("estimateLlmBaseline", () => {
  it("prices the same input tokens plus assumed output on the LLM tier", () => {
    const est = estimateLlmBaseline("a2", [trace(700), trace(700)], "standard");
    expect(est.calls).toBe(2);
    expect(est.inputTokens).toBe(1400);
    expect(est.outputTokens).toBe(2 * 250);
    expect(est.llmUsd).toBeCloseTo((1400 / 1e6) * 2 + (500 / 1e6) * 10, 9); // 0.0078
    expect(est.jevUsd).toBeCloseTo((1400 / 1e6) * 0.042, 9);
    expect(est.ratio).toBeCloseTo(0.0078 / 0.0000588, 1);
    expect(est.savingsPct).toBeGreaterThan(99);
  });

  it("uses token counts even when traces were served from cache", () => {
    const est = estimateLlmBaseline("a2", [trace(700, true)], "strong");
    expect(est.jevUsd).toBeGreaterThan(0);
    expect(est.tierLabel).toBe("Claude Opus 5");
  });

  it("returns zeros and null ratio for no traces", () => {
    const est = estimateLlmBaseline("a1", [], "standard");
    expect(est.llmUsd).toBe(0);
    expect(est.ratio).toBeNull();
    expect(est.savingsPct).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run shared/src/costModel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `shared/src/costModel.ts`

```ts
import { CLAUDE_TIERS, claudeCostUsd, jevCostUsd, type ClaudeTierId } from "./pricing";
import type { BaselineEstimate, JevTrace, ScenarioId } from "./types";

export interface BaselineAssumption {
  /** What LLM work the Jev call replaces. */
  title_zh: string;
  /** Output tokens an LLM would have to generate per Jev call (JSON answers, a line number, a verdict...). */
  outputTokensPerCall: number;
  note_zh: string;
}

/**
 * Per-scenario assumptions for the "if we had used an LLM" baseline. Input tokens are taken
 * from the real Jev request (same state + same questions); output tokens are these constants.
 * All numbers are shown in the UI next to the estimate.
 */
export const BASELINE_ASSUMPTIONS: Record<ScenarioId, BaselineAssumption> = {
  p0: { title_zh: "LLM 结构化输出回答同一问题", outputTokensPerCall: 100, note_zh: "环境检查用" },
  a1: { title_zh: "LLM 结构化输出回答同一组问题", outputTokensPerCall: 150, note_zh: "3 题 JSON 约 150 tokens" },
  a2: { title_zh: "LLM 一次 JSON 分类 10 个字段", outputTokensPerCall: 250, note_zh: "10 个字段的 JSON 约 250 tokens；改阈值时 LLM 需全部重跑" },
  a3: { title_zh: "LLM 读全文并指出行号", outputTokensPerCall: 100, note_zh: "对比向量检索时 Jev 并不更便宜；优势是零索引与可解释" },
  a4: { title_zh: "LLM 结构化输出 8 个概率分布", outputTokensPerCall: 300, note_zh: "此场景另有实测数字" },
  b1: { title_zh: "LLM 做意图与护栏分类", outputTokensPerCall: 200, note_zh: "只算分类步骤；端到端节省另见 B1 页面双基线" },
  b2: { title_zh: "同一 LLM 逐条核验引用", outputTokensPerCall: 60, note_zh: "只算核验步骤；生成步骤两边相同" },
  b3: { title_zh: "LLM 逐段判定 4 项", outputTokensPerCall: 80, note_zh: "只算守门步骤；端到端还节省了生成阶段的输入 tokens" },
  b4: { title_zh: "LLM function calling 一次", outputTokensPerCall: 120, note_zh: "纯设备指令；复合/闲聊指令另加一次 Sonnet 5" },
};

export function estimateLlmBaseline(
  scenario: ScenarioId,
  jevTraces: readonly JevTrace[],
  tier: ClaudeTierId = "standard",
): BaselineEstimate {
  const assumption = BASELINE_ASSUMPTIONS[scenario];
  const calls = jevTraces.length;
  const inputTokens = jevTraces.reduce((sum, t) => sum + t.response.usage.input_tokens, 0);
  const outputTokens = calls * assumption.outputTokensPerCall;
  const llmUsd = claudeCostUsd(tier, inputTokens, outputTokens);
  const jevUsd = jevCostUsd(inputTokens);
  const ratio = jevUsd > 0 ? llmUsd / jevUsd : null;
  const savingsPct = llmUsd > 0 ? (1 - jevUsd / llmUsd) * 100 : 0;
  return {
    scenario,
    tier,
    tierLabel: CLAUDE_TIERS[tier].label,
    calls,
    inputTokens,
    outputTokens,
    llmUsd,
    jevUsd,
    ratio,
    savingsPct,
    assumption,
  };
}
```

Append to `shared/src/index.ts`:
```ts
export * from "./costModel";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src
git commit -m "feat(shared): LLM baseline cost model"
```

---

### Task 5: server — queue and JSON file cache

**Files:**
- Create: `server/src/lib/queue.ts`, `server/src/lib/cache.ts`, `server/src/lib/trace.ts`
- Test: `server/src/lib/queue.test.ts`, `server/src/lib/cache.test.ts`

**Interfaces:**
- Produces: `createQueue(limit): Queue` with `run(fn)` and `stats()`; `queues.jev`, `queues.claude`; `cacheKey(value)`, `resolveCacheMode(override?)`, `JsonFileCache<T>` (`get`, `set`), `JEV_CACHE_DIR`, type `CacheMode`; `newTraceId()`.

- [ ] **Step 1: Write failing tests**

`server/src/lib/queue.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createQueue } from "./queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createQueue", () => {
  it("never runs more than `limit` tasks at once and reports stats", async () => {
    const q = createQueue(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
      return "ok";
    };
    const started = Promise.all([q.run(task), q.run(task), q.run(task), q.run(task)]);
    expect(q.stats().limit).toBe(2);
    const results = await started;
    expect(results).toEqual(["ok", "ok", "ok", "ok"]);
    expect(peak).toBe(2);
    expect(q.stats().active).toBe(0);
  });
});
```

`server/src/lib/cache.test.ts`:
```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileCache, cacheKey, resolveCacheMode } from "./cache";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("cache", () => {
  it("produces the same key regardless of key order", () => {
    expect(cacheKey({ a: 1, b: { c: 2, d: 3 } })).toBe(cacheKey({ b: { d: 3, c: 2 }, a: 1 }));
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });

  it("round-trips JSON values through files", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-cache-"));
    const cache = new JsonFileCache<{ x: number }>(dir);
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", { x: 1 });
    expect(await cache.get("k")).toEqual({ x: 1 });
  });

  it("resolves cache mode from override, env, then default", () => {
    expect(resolveCacheMode("off")).toBe("off");
    const prev = process.env.JEV_CACHE;
    process.env.JEV_CACHE = "read-only";
    expect(resolveCacheMode()).toBe("read-only");
    process.env.JEV_CACHE = "garbage";
    expect(resolveCacheMode()).toBe("read-write");
    if (prev === undefined) delete process.env.JEV_CACHE;
    else process.env.JEV_CACHE = prev;
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`server/src/lib/queue.ts`:
```ts
import pLimit from "p-limit";

export interface Queue {
  run<T>(fn: () => Promise<T>): Promise<T>;
  stats(): { active: number; pending: number; limit: number };
}

export function createQueue(limit: number): Queue {
  const limiter = pLimit(limit);
  return {
    run: (fn) => limiter(fn),
    stats: () => ({ active: limiter.activeCount, pending: limiter.pendingCount, limit }),
  };
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/** Public TypeSafe endpoint throttles above ~8 concurrent; Bedrock account limits vary. */
export const queues = {
  jev: createQueue(envInt("JEV_CONCURRENCY", 6)),
  claude: createQueue(envInt("CLAUDE_CONCURRENCY", 3)),
};
```

`server/src/lib/cache.ts`:
```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stableStringify } from "@jev/shared";

export type CacheMode = "off" | "read-write" | "read-only";

export const JEV_CACHE_DIR = fileURLToPath(new URL("../../.cache/jev/", import.meta.url));

export function cacheKey(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function resolveCacheMode(override?: CacheMode): CacheMode {
  if (override) return override;
  const v = process.env.JEV_CACHE;
  return v === "off" || v === "read-only" || v === "read-write" ? v : "read-write";
}

export class JsonFileCache<T> {
  constructor(private readonly dir: string) {}

  async get(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir, `${key}.json`), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify(value, null, 2));
  }
}
```

`server/src/lib/trace.ts`:
```ts
import { randomUUID } from "node:crypto";

export const newTraceId = (): string => randomUUID();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): concurrency queue and JSON file cache"
```

---

### Task 6: server — `askJev` wrapper

**Files:**
- Create: `server/src/lib/jev.ts`
- Test: `server/src/lib/jev.test.ts`

**Interfaces:**
- Consumes: `assertValidQuestions`, `jevCostUsd`, `JevTrace`, `ScenarioId` (shared); `cacheKey`, `JsonFileCache`, `JEV_CACHE_DIR`, `resolveCacheMode`; `queues.jev`; `newTraceId`.
- Produces: `createJev({ client, cache?, queue? })` → `askJev(input, opts)`; default `askJev`; `defaultJevClient()`; types `JevLike`, `AskJevInput<Q>`, `AskJevOptions`, `AskJevOutput<Q>`.

- [ ] **Step 1: Write the failing test** `server/src/lib/jev.test.ts`

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuestionValidationError } from "@jev/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFileCache } from "./cache";
import { createJev, type JevLike } from "./jev";
import { createQueue } from "./queue";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

function fakeClient() {
  const systemOne = vi.fn(async () => ({
    model: "jev-1.13.0",
    answers: { urgent: { type: "noul" as const, noul: 0.93 } },
    usage: { input_tokens: 300, output_tokens: 20 },
  }));
  const client: JevLike = { defaultModel: "jev-latest", systemOne: systemOne as unknown as JevLike["systemOne"] };
  return { client, systemOne };
}

const questions = { urgent: { type: "noul" as const, instructions: "Is it urgent?" } };

describe("askJev", () => {
  it("calls the client once, records a trace with latency and cost, then serves the second call from cache", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });

    const first = await askJev({ scenario: "p0", state: "help now", questions }, { cache: "read-write" });
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(first.result.answers.urgent.noul).toBe(0.93);
    expect(first.trace.kind).toBe("jev");
    expect(first.trace.cached).toBe(false);
    expect(first.trace.model).toBe("jev-1.13.0");
    expect(first.trace.request.model).toBe("jev-latest");
    expect(first.trace.cost.usd).toBeCloseTo((300 / 1e6) * 0.042, 12);
    expect(first.trace.latencyMs).toBeGreaterThanOrEqual(0);

    const second = await askJev({ scenario: "p0", state: "help now", questions }, { cache: "read-write" });
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(second.trace.cached).toBe(true);
    expect(second.trace.cost.usd).toBe(0);
    expect(second.trace.latencyMs).toBe(0);
    expect(second.trace.originalLatencyMs).toBe(first.trace.latencyMs);
    expect(second.result.answers.urgent.noul).toBe(0.93);
    expect(second.trace.id).not.toBe(first.trace.id);
  });

  it("bypasses the cache when mode is off", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });
    await askJev({ scenario: "p0", state: "x", questions }, { cache: "off" });
    await askJev({ scenario: "p0", state: "x", questions }, { cache: "off" });
    expect(systemOne).toHaveBeenCalledTimes(2);
  });

  it("validates questions before touching the client", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-"));
    const { client, systemOne } = fakeClient();
    const askJev = createJev({ client: () => client, cache: new JsonFileCache(dir), queue: createQueue(2) });
    await expect(askJev({ scenario: "p0", state: "x", questions: {} }, { cache: "off" })).rejects.toBeInstanceOf(QuestionValidationError);
    expect(systemOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/lib/jev.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `server/src/lib/jev.ts`

```ts
import { TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { assertValidQuestions, jevCostUsd, type Answers, type JevTrace, type ScenarioId } from "@jev/shared";
import { JEV_CACHE_DIR, JsonFileCache, cacheKey, resolveCacheMode, type CacheMode } from "./cache";
import { queues, type Queue } from "./queue";
import { newTraceId } from "./trace";

/** The subset of TypeSafeClient we depend on, so tests can inject a fake. */
export interface JevLike {
  readonly defaultModel: string;
  systemOne<Q extends Questions>(request: { state: EntryType; questions: Q; model?: string }): PromiseLike<SystemOneResult<Q>>;
}

export interface AskJevInput<Q extends Questions> {
  scenario: ScenarioId;
  state: EntryType;
  questions: Q;
  model?: string;
}

export interface AskJevOptions {
  cache?: CacheMode;
}

export interface AskJevOutput<Q extends Questions> {
  result: SystemOneResult<Q>;
  trace: JevTrace;
}

export function createJev(deps: { client: () => JevLike; cache?: JsonFileCache<JevTrace>; queue?: Queue }) {
  const cache = deps.cache ?? new JsonFileCache<JevTrace>(JEV_CACHE_DIR);
  const queue = deps.queue ?? queues.jev;

  return async function askJev<Q extends Questions>(input: AskJevInput<Q>, opts: AskJevOptions = {}): Promise<AskJevOutput<Q>> {
    assertValidQuestions(input.questions);
    const client = deps.client();
    const model = input.model ?? client.defaultModel;
    const mode = resolveCacheMode(opts.cache);
    const key = cacheKey({ state: input.state, questions: input.questions, model });

    if (mode !== "off") {
      const hit = await cache.get(key);
      if (hit) {
        const trace: JevTrace = {
          ...hit,
          id: newTraceId(),
          scenario: input.scenario,
          cached: true,
          latencyMs: 0,
          originalLatencyMs: hit.originalLatencyMs ?? hit.latencyMs,
          cost: { usd: 0 },
        };
        return { result: resultFromTrace<Q>(trace), trace };
      }
    }

    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const result = await queue.run(() =>
      Promise.resolve(client.systemOne({ state: input.state, questions: input.questions, model })),
    );
    const latencyMs = Math.round(performance.now() - t0);
    const trace: JevTrace = {
      kind: "jev",
      id: newTraceId(),
      scenario: input.scenario,
      startedAt,
      latencyMs,
      cached: false,
      model: result.model,
      request: { state: input.state, questions: input.questions, model },
      response: { answers: result.answers as unknown as Answers, usage: result.usage },
      cost: { usd: jevCostUsd(result.usage.input_tokens, result.usage.output_tokens) },
    };
    if (mode === "read-write") await cache.set(key, trace);
    return { result, trace };
  };
}

function resultFromTrace<Q extends Questions>(trace: JevTrace): SystemOneResult<Q> {
  return {
    model: trace.model,
    answers: trace.response.answers as unknown as SystemOneResult<Q>["answers"],
    usage: trace.response.usage,
  };
}

let singleton: TypeSafeClient | undefined;
/** Lazy so importing this module never throws when TYPESAFE_API_KEY is unset (e.g. in tests). */
export function defaultJevClient(): JevLike {
  singleton ??= new TypeSafeClient({
    timeout: 15_000,
    ...(process.env.JEV_MODEL ? { defaultModel: process.env.JEV_MODEL } : {}),
  });
  return singleton;
}

export const askJev = createJev({ client: defaultJevClient });
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server && npm run typecheck -w @jev/server`
Expected: PASS. If `SystemOneResult<Q>["answers"]` does not accept the cast, change to `as never`.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): askJev wrapper with tracing, cost, cache and queue"
```

---

### Task 7: server — Claude (Bedrock runtime) wrapper

**Files:**
- Create: `server/src/lib/claude.ts`
- Test: `server/src/lib/claude.test.ts`

**Interfaces:**
- Consumes: `CLAUDE_TIERS`, `claudeCostUsd`, `ClaudeTierId`, `ClaudeTrace`, `ScenarioId`; `queues.claude`; `newTraceId`.
- Produces: `createClaude({ client, queue? })` → `{ claudeText, claudeParse }`; default exports `claudeText`, `claudeParse`, `defaultClaudeClient`; errors `ClaudeRefusalError`, `ClaudeStructuredOutputError`, `ClaudeTierError`; types `ClaudeCallBase`, `ClaudeParseCall<T>`, `ClaudeClientLike`, `Effort`.

- [ ] **Step 1: Write the failing test** `server/src/lib/claude.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeRefusalError, ClaudeStructuredOutputError, ClaudeTierError, createClaude, type ClaudeClientLike } from "./claude";
import { createQueue } from "./queue";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "global.anthropic.claude-sonnet-5",
    content: [{ type: "text", text: "hello", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...overrides,
  };
}

function fakeClient(msg: unknown) {
  const create = vi.fn(async () => msg);
  const parse = vi.fn(async () => msg);
  const client = { messages: { create, parse } } as unknown as ClaudeClientLike;
  return { client, create, parse };
}

describe("claudeText", () => {
  it("returns text and a priced trace", async () => {
    const { client, create } = fakeClient(message());
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    const { text, trace } = await claudeText({ scenario: "p0", purpose: "test", messages: [{ role: "user", content: "hi" }] });
    expect(text).toBe("hello");
    expect(trace.kind).toBe("claude");
    expect(trace.tier).toBe("standard");
    expect(trace.cost.usd).toBeCloseTo((1000 / 1e6) * 2 + (500 / 1e6) * 10, 9);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: "global.anthropic.claude-sonnet-5", max_tokens: 2048 });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("passes effort and rejects temperature on the 5 family", async () => {
    const { client, create } = fakeClient(message());
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    await claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], effort: "low" });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ output_config: { effort: "low" } });
    await expect(
      claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], temperature: 0 }),
    ).rejects.toBeInstanceOf(ClaudeTierError);
    await claudeText({ scenario: "p0", purpose: "t", tier: "prev_sonnet", messages: [{ role: "user", content: "hi" }], temperature: 0 });
    expect(create.mock.calls[1]?.[0]).toMatchObject({ temperature: 0, model: "global.anthropic.claude-sonnet-4-6" });
  });

  it("throws a typed error on refusal", async () => {
    const { client } = fakeClient(message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } }));
    const { claudeText } = createClaude({ client: () => client, queue: createQueue(1) });
    await expect(claudeText({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ClaudeRefusalError);
  });
});

describe("claudeParse", () => {
  const schema = z.object({ ok: z.boolean() });

  it("returns parsed output and sends output_config.format", async () => {
    const { client, parse } = fakeClient(message({ parsed_output: { ok: true } }));
    const { claudeParse } = createClaude({ client: () => client, queue: createQueue(1) });
    const { parsed, trace } = await claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema });
    expect(parsed).toEqual({ ok: true });
    expect(trace.purpose).toBe("t");
    const params = parse.mock.calls[0]?.[0] as { output_config?: { format?: unknown } };
    expect(params.output_config?.format).toBeDefined();
  });

  it("throws when parsed_output is null or output was truncated", async () => {
    const { client } = fakeClient(message({ parsed_output: null }));
    const { claudeParse } = createClaude({ client: () => client, queue: createQueue(1) });
    await expect(claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema })).rejects.toBeInstanceOf(ClaudeStructuredOutputError);
    const truncated = fakeClient(message({ stop_reason: "max_tokens", parsed_output: { ok: true } }));
    const c2 = createClaude({ client: () => truncated.client, queue: createQueue(1) });
    await expect(c2.claudeParse({ scenario: "p0", purpose: "t", messages: [{ role: "user", content: "hi" }], schema })).rejects.toThrow(/max_tokens|maxTokens/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/lib/claude.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `server/src/lib/claude.ts`

```ts
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { CLAUDE_TIERS, claudeCostUsd, type ClaudeTierId, type ClaudeTrace, type ScenarioId } from "@jev/shared";
import { queues, type Queue } from "./queue";
import { newTraceId } from "./trace";

export type Effort = "low" | "medium" | "high";

export interface ClaudeCallBase {
  scenario: ScenarioId;
  /** Tag shown in the inspector, e.g. "generate_answer". */
  purpose: string;
  /** Defaults to "standard" (Claude Sonnet 5). */
  tier?: ClaudeTierId;
  system?: string;
  messages: Anthropic.MessageParam[];
  /** Default 2048; raise for long generations. */
  maxTokens?: number;
  effort?: Effort;
  /** Only valid on tiers with `supportsTemperature` (Claude 4.6 family). */
  temperature?: number;
}

export interface ClaudeParseCall<T> extends ClaudeCallBase {
  schema: z.ZodType<T>;
}

export class ClaudeRefusalError extends Error {
  constructor(
    readonly category: string | null,
    readonly explanation: string | null,
  ) {
    super(`Claude refused the request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

export class ClaudeStructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = "ClaudeStructuredOutputError";
  }
}

export class ClaudeTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeTierError";
  }
}

type ParsedLike<T> = Anthropic.Message & { parsed_output: T | null };

/** The subset of the Bedrock client we use, so tests can inject a fake. */
export interface ClaudeClientLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
    parse(params: Anthropic.MessageCreateParamsNonStreaming): Promise<ParsedLike<unknown>>;
  };
}

export function createClaude(deps: { client: () => ClaudeClientLike; queue?: Queue }) {
  const queue = deps.queue ?? queues.claude;

  function buildParams(call: ClaudeCallBase) {
    const tier = CLAUDE_TIERS[call.tier ?? "standard"];
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: tier.modelId,
      max_tokens: call.maxTokens ?? 2048,
      messages: call.messages,
    };
    if (call.system) params.system = call.system;
    if (call.effort) {
      if (!tier.supportsEffort) throw new ClaudeTierError(`${tier.label} 不支持 output_config.effort`);
      params.output_config = { effort: call.effort };
    }
    if (call.temperature !== undefined) {
      if (!tier.supportsTemperature) throw new ClaudeTierError(`${tier.label} 不支持 temperature 参数（Claude 5 系列已移除）`);
      params.temperature = call.temperature;
    }
    return { tier, params };
  }

  function toTrace(call: ClaudeCallBase, tierId: ClaudeTierId, msg: Anthropic.Message, startedAt: string, latencyMs: number): ClaudeTrace {
    return {
      kind: "claude",
      id: newTraceId(),
      scenario: call.scenario,
      purpose: call.purpose,
      startedAt,
      latencyMs,
      tier: tierId,
      model: msg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cost: { usd: claudeCostUsd(tierId, msg.usage.input_tokens, msg.usage.output_tokens) },
      stopReason: msg.stop_reason ?? null,
    };
  }

  function throwIfRefused(msg: Anthropic.Message): void {
    if (msg.stop_reason === "refusal") {
      const details = (msg as { stop_details?: { category?: string | null; explanation?: string | null } | null }).stop_details;
      throw new ClaudeRefusalError(details?.category ?? null, details?.explanation ?? null);
    }
  }

  async function claudeText(call: ClaudeCallBase): Promise<{ text: string; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const msg = await queue.run(() => deps.client().messages.create(params));
    const trace = toTrace(call, tier.id, msg, startedAt, Math.round(performance.now() - t0));
    throwIfRefused(msg);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, trace };
  }

  async function claudeParse<T>(call: ClaudeParseCall<T>): Promise<{ parsed: T; trace: ClaudeTrace }> {
    const { tier, params } = buildParams(call);
    const withFormat: Anthropic.MessageCreateParamsNonStreaming = {
      ...params,
      output_config: { ...(params.output_config ?? {}), format: zodOutputFormat(call.schema) },
    };
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const msg = (await queue.run(() => deps.client().messages.parse(withFormat))) as ParsedLike<T>;
    const trace = toTrace(call, tier.id, msg, startedAt, Math.round(performance.now() - t0));
    throwIfRefused(msg);
    if (msg.stop_reason === "max_tokens") {
      throw new ClaudeStructuredOutputError("输出被 max_tokens 截断，请提高 maxTokens 或减少问题数量", msg.content);
    }
    if (msg.parsed_output === null || msg.parsed_output === undefined) {
      throw new ClaudeStructuredOutputError("结构化输出解析失败（parsed_output 为空）", msg.content);
    }
    return { parsed: msg.parsed_output, trace };
  }

  return { claudeText, claudeParse };
}

let singleton: AnthropicBedrock | undefined;
/** Bedrock runtime (InvokeModel) client; credentials from the default AWS chain (AWS_PROFILE). */
export function defaultClaudeClient(): ClaudeClientLike {
  singleton ??= new AnthropicBedrock({ awsRegion: process.env.AWS_REGION ?? "us-east-1" });
  return singleton as unknown as ClaudeClientLike;
}

const defaultClaude = createClaude({ client: defaultClaudeClient });
export const claudeText = defaultClaude.claudeText;
export const claudeParse = defaultClaude.claudeParse;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server && npm run typecheck -w @jev/server`
Expected: PASS. If `output_config` typing rejects `{ effort }` alone, cast the object `as Anthropic.MessageCreateParamsNonStreaming["output_config"]`.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): Claude Bedrock runtime wrapper with tiers, tracing and structured output"
```

---

### Task 8: server — LLM-backed System One adapter

**Files:**
- Create: `server/src/lib/llmSystemOne.ts`
- Test: `server/src/lib/llmSystemOne.test.ts`

**Interfaces:**
- Consumes: `claudeParse` (Task 7), `Questions`, `Answers`, `EntryType`, `ClaudeTierId`, `ScenarioId`, `ClaudeTrace`.
- Produces: `buildSchema(questions)`, `buildUserMessage(state, questions)`, `normalizeAnswers(raw, questions)`, `optionKeys(question)`, `SYSTEM_PROMPT`, `createLlmSystemOne({ parse })` → `askLlmSystemOne(input)`; default `askLlmSystemOne`.

- [ ] **Step 1: Write the failing test** `server/src/lib/llmSystemOne.test.ts`

```ts
import type { Questions } from "@jev/shared";
import { describe, expect, it, vi } from "vitest";
import { buildSchema, buildUserMessage, createLlmSystemOne, normalizeAnswers, optionKeys } from "./llmSystemOne";

const questions: Questions = {
  dept: { type: "choice", instructions: "Which team?", criteria: { billing: null, tech: "Bugs", sales: null } },
  sev: { type: "score", instructions: "How severe?", criteria: ["Cosmetic", "Degraded", "Blocking"] },
  urgent: { type: "noul", instructions: "Urgent?" },
};

describe("llmSystemOne", () => {
  it("lists option keys per primitive", () => {
    expect(optionKeys(questions.dept!)).toEqual(["billing", "tech", "sales"]);
    expect(optionKeys(questions.sev!)).toEqual(["0", "1", "2"]);
    expect(optionKeys(questions.urgent!)).toEqual(["yes"]);
  });

  it("builds a schema that accepts well-formed output and rejects extra options", () => {
    const schema = buildSchema(questions);
    const good = {
      dept: { probabilities: { billing: 0.7, tech: 0.2, sales: 0.1 } },
      sev: { probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 } },
      urgent: { p_yes: 0.9 },
    };
    expect(schema.safeParse(good).success).toBe(true);
    const bad = { ...good, dept: { probabilities: { billing: 1, other: 0 } } };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("normalizes distributions, records deltas, and derives choice/score/noul", () => {
    const { answers, debug } = normalizeAnswers(
      {
        dept: { probabilities: { billing: 0.9, tech: 0.3, sales: 0 } }, // sums to 1.2
        sev: { probabilities: { "0": 0, "1": 0, "2": 0 } }, // degenerate
        urgent: { p_yes: 1.4 }, // clamped
      },
      questions,
    );
    const dept = answers.dept!;
    expect(dept.type).toBe("choice");
    if (dept.type === "choice") {
      expect(dept.choice).toBe("billing");
      expect(dept.probabilities.billing).toBeCloseTo(0.75, 6);
      expect(dept.confidence).toBeNull();
    }
    expect(debug.normalizationDelta.dept).toBeCloseTo(0.2, 6);
    const sev = answers.sev!;
    if (sev.type === "score") {
      expect(sev.probabilities).toEqual({ "0": 1 / 3, "1": 1 / 3, "2": 1 / 3 });
      expect(sev.score).toBeCloseTo(1, 6);
      expect(sev.legend["1"]).toBe("Degraded");
    }
    expect(debug.degenerate).toEqual(["sev"]);
    const urgent = answers.urgent!;
    if (urgent.type === "noul") expect(urgent.noul).toBe(1);
  });

  it("includes state and questions verbatim in the user message", () => {
    const msg = buildUserMessage({ text: "hi" }, questions);
    expect(msg).toContain("STATE:");
    expect(msg).toContain('"text": "hi"');
    expect(msg).toContain("Which team?");
  });

  it("asks Claude once with a low-effort structured call and returns answers + trace", async () => {
    const parse = vi.fn(async () => ({
      parsed: {
        dept: { probabilities: { billing: 1, tech: 0, sales: 0 } },
        sev: { probabilities: { "0": 0, "1": 1, "2": 0 } },
        urgent: { p_yes: 0.2 },
      },
      trace: { kind: "claude" as const, id: "c", scenario: "a4" as const, purpose: "llmSystemOne", startedAt: "", latencyMs: 900, tier: "standard" as const, model: "m", inputTokens: 500, outputTokens: 80, cost: { usd: 0.0018 }, stopReason: "end_turn" },
    }));
    const ask = createLlmSystemOne({ parse: parse as never });
    const out = await ask({ scenario: "a4", state: "s", questions, tier: "standard" });
    expect(out.answers.dept?.type).toBe("choice");
    expect(out.trace.latencyMs).toBe(900);
    const call = parse.mock.calls[0]?.[0] as { effort?: string; maxTokens?: number; tier?: string };
    expect(call.effort).toBe("low");
    expect(call.tier).toBe("standard");
    expect(call.maxTokens).toBe(256 + 16 * 7);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/lib/llmSystemOne.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `server/src/lib/llmSystemOne.ts`

```ts
import { z } from "zod";
import { CLAUDE_TIERS, type Answers, type ClaudeTierId, type ClaudeTrace, type EntryType, type Question, type Questions, type ScenarioId } from "@jev/shared";
import { ClaudeStructuredOutputError, claudeParse as defaultParse, type ClaudeParseCall } from "./claude";

/**
 * TypeScript port of the idea behind TypeSafe's `system-one-adapter`: ask an LLM the same
 * Choice/Score/Noul questions and coerce its answer into Jev's response shape so A4 can compare
 * like-for-like. The LLM's probabilities are "verbalized", not sampled — the 学习卡 says so.
 */
export const SYSTEM_PROMPT = [
  "You are a calibrated decision model. Read STATE literally and answer every question in QUESTIONS.",
  "For a choice question, return a probability for each listed option; for a score question, a probability for each level index; for a noul question, the probability that the answer is yes.",
  "Each distribution must sum to 1.0 and reflect how likely each option is to be correct.",
  "Do not add options, explanations, or any text outside the required structure.",
].join(" ");

export function optionKeys(question: Question): string[] {
  switch (question.type) {
    case "choice":
      return Object.keys(question.criteria);
    case "score":
      return question.criteria.map((_, i) => String(i));
    case "noul":
      return ["yes"];
  }
}

const prob = () => z.number().min(0).max(1);

export function buildSchema(questions: Questions) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      shape[id] = z.object({ p_yes: prob() });
    } else {
      const probShape = Object.fromEntries(optionKeys(q).map((k) => [k, prob()]));
      shape[id] = z.object({ probabilities: z.object(probShape) });
    }
  }
  return z.object(shape);
}

export function buildUserMessage(state: EntryType, questions: Questions): string {
  return `STATE:\n${JSON.stringify(state, null, 2)}\n\nQUESTIONS:\n${JSON.stringify(questions, null, 2)}`;
}

export interface NormalizeDebug {
  /** |sum - 1| per question before normalization. */
  normalizationDelta: Record<string, number>;
  /** Questions whose distribution summed to 0 and were replaced by uniform. */
  degenerate: string[];
}

const clamp01 = (x: unknown): number => {
  const n = typeof x === "number" && Number.isFinite(x) ? x : 0;
  return Math.min(1, Math.max(0, n));
};

export function normalizeAnswers(raw: Record<string, unknown>, questions: Questions): { answers: Answers; debug: NormalizeDebug } {
  const answers: Answers = {};
  const debug: NormalizeDebug = { normalizationDelta: {}, degenerate: [] };
  for (const [id, q] of Object.entries(questions)) {
    const entry = (raw[id] ?? {}) as { p_yes?: unknown; probabilities?: Record<string, unknown> };
    if (q.type === "noul") {
      answers[id] = { type: "noul", noul: clamp01(entry.p_yes ?? 0.5) };
      continue;
    }
    const keys = optionKeys(q);
    const clamped = keys.map((k) => clamp01(entry.probabilities?.[k]));
    const sum = clamped.reduce((a, b) => a + b, 0);
    let normalized: number[];
    if (sum <= 0) {
      normalized = keys.map(() => 1 / keys.length);
      debug.degenerate.push(id);
      debug.normalizationDelta[id] = 1;
    } else {
      normalized = clamped.map((p) => p / sum);
      debug.normalizationDelta[id] = Math.abs(sum - 1);
    }
    const probabilities = Object.fromEntries(keys.map((k, i) => [k, normalized[i] ?? 0]));
    if (q.type === "choice") {
      const best = keys.reduce((a, b) => ((probabilities[a] ?? 0) >= (probabilities[b] ?? 0) ? a : b));
      answers[id] = { type: "choice", choice: best, probabilities, confidence: null };
    } else {
      const score = normalized.reduce((acc, p, i) => acc + p * i, 0);
      const legend = Object.fromEntries(q.criteria.map((c, i) => [String(i), c]));
      answers[id] = { type: "score", score, probabilities, legend, confidence: null } as Answers[string];
    }
  }
  return { answers, debug };
}

export interface AskLlmSystemOneInput {
  scenario: ScenarioId;
  state: EntryType;
  questions: Questions;
  tier: ClaudeTierId;
  temperature?: number;
  maxTokens?: number;
}

export interface AskLlmSystemOneOutput {
  answers: Answers;
  trace: ClaudeTrace;
  debug: NormalizeDebug & { retried: boolean };
}

type ParseFn = <T>(call: ClaudeParseCall<T>) => Promise<{ parsed: T; trace: ClaudeTrace }>;

export function createLlmSystemOne(deps: { parse: ParseFn }) {
  return async function askLlmSystemOne(input: AskLlmSystemOneInput): Promise<AskLlmSystemOneOutput> {
    const schema = buildSchema(input.questions);
    const optionCount = Object.values(input.questions).reduce((n, q) => n + optionKeys(q).length, 0);
    const tier = CLAUDE_TIERS[input.tier];
    const base: ClaudeParseCall<z.infer<typeof schema>> = {
      scenario: input.scenario,
      purpose: "llmSystemOne",
      tier: input.tier,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input.state, input.questions) }],
      maxTokens: input.maxTokens ?? 256 + 16 * optionCount,
      ...(tier.supportsEffort ? { effort: "low" as const } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      schema,
    };
    let retried = false;
    let result: { parsed: z.infer<typeof schema>; trace: ClaudeTrace };
    try {
      result = await deps.parse(base);
    } catch (err) {
      if (!(err instanceof ClaudeStructuredOutputError)) throw err;
      retried = true;
      result = await deps.parse({
        ...base,
        messages: [
          ...base.messages,
          { role: "user", content: "Your previous reply did not match the required structure. Return only the structured object with a probability for every listed option." },
        ],
      });
    }
    const { answers, debug } = normalizeAnswers(result.parsed as Record<string, unknown>, input.questions);
    return { answers, trace: result.trace, debug: { ...debug, retried } };
  };
}

export const askLlmSystemOne = createLlmSystemOne({ parse: defaultParse as ParseFn });
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run server && npm run typecheck -w @jev/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): LLM-backed System One adapter for like-for-like comparison"
```

---

### Task 9: server — error mapping and usage accumulator

**Files:**
- Create: `server/src/lib/errors.ts`, `server/src/lib/usage.ts`
- Test: `server/src/lib/errors.test.ts`, `server/src/lib/usage.test.ts`

**Interfaces:**
- Produces: `toHttpError(err): HttpErrorBody` (`{ status, code, message, detail? }`); `createUsage()` → `{ record(trace), snapshot(), reset() }`, default `usage`.

- [ ] **Step 1: Write failing tests**

`server/src/lib/errors.test.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { QuestionValidationError } from "@jev/shared";
import { AuthenticationError, RateLimitError, UnprocessableEntityError } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeRefusalError } from "./claude";
import { toHttpError } from "./errors";

describe("toHttpError", () => {
  it("maps validation errors to 400 with issues", () => {
    const e = toHttpError(new QuestionValidationError([{ questionId: "q", message: "bad" }]));
    expect(e.status).toBe(400);
    expect(e.code).toBe("invalid_questions");
    expect(e.detail).toEqual([{ questionId: "q", message: "bad" }]);
  });
  it("maps Jev auth, 422 and rate limits", () => {
    expect(toHttpError(new AuthenticationError(401, { error: "nope" }, new Headers())).status).toBe(401);
    const u = toHttpError(new UnprocessableEntityError(422, { detail: [{ loc: ["body", "questions"], msg: "x" }] }, new Headers()));
    expect(u.status).toBe(422);
    expect(u.detail).toBeDefined();
    expect(toHttpError(new RateLimitError(429, {}, new Headers())).status).toBe(503);
  });
  it("maps Claude refusal and Bedrock throttling", () => {
    expect(toHttpError(new ClaudeRefusalError("cyber", null)).status).toBe(422);
    const throttled = new Anthropic.RateLimitError(429, { message: "ThrottlingException" }, "throttled", new Headers());
    expect(toHttpError(throttled).status).toBe(503);
  });
  it("falls back to 500 with the message", () => {
    const e = toHttpError(new Error("boom"));
    expect(e.status).toBe(500);
    expect(e.message).toBe("boom");
  });
});
```

`server/src/lib/usage.test.ts`:
```ts
import type { ClaudeTrace, JevTrace } from "@jev/shared";
import { describe, expect, it } from "vitest";
import { createUsage } from "./usage";

const jev = (usd: number, cached: boolean): JevTrace => ({
  kind: "jev", id: "j", scenario: "a1", startedAt: "", latencyMs: cached ? 0 : 100, cached, model: "jev-1.13.0",
  request: { state: "s", questions: { q: { type: "noul", instructions: "?" } }, model: "jev-latest" },
  response: { answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 400, output_tokens: 10 } },
  cost: { usd },
});
const claude: ClaudeTrace = { kind: "claude", id: "c", scenario: "b1", purpose: "reply", startedAt: "", latencyMs: 1500, tier: "standard", model: "m", inputTokens: 600, outputTokens: 300, cost: { usd: 0.0042 }, stopReason: "end_turn" };

describe("usage", () => {
  it("accumulates Jev and Claude separately and counts cached calls", () => {
    const u = createUsage();
    u.record(jev(0.0000168, false));
    u.record(jev(0, true));
    u.record(claude);
    const s = u.snapshot();
    expect(s.jev.calls).toBe(2);
    expect(s.jev.cached).toBe(1);
    expect(s.jev.usd).toBeCloseTo(0.0000168, 9);
    expect(s.jev.inputTokens).toBe(800);
    expect(s.claude.calls).toBe(1);
    expect(s.claude.usd).toBeCloseTo(0.0042, 9);
    expect(s.claude.totalLatencyMs).toBe(1500);
    u.reset();
    expect(u.snapshot().jev.calls).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`server/src/lib/errors.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { QuestionValidationError } from "@jev/shared";
import { APIConnectionError, APIError as JevAPIError, AuthenticationError, RateLimitError, UnprocessableEntityError } from "@typesafe-ai/sdk";
import { ClaudeRefusalError, ClaudeStructuredOutputError, ClaudeTierError } from "./claude";

export interface HttpErrorBody {
  status: number;
  code: string;
  /** Chinese, user-facing. */
  message: string;
  detail?: unknown;
}

/** Map SDK and domain errors to HTTP responses; the raw detail is kept for the inspector. */
export function toHttpError(err: unknown): HttpErrorBody {
  if (err instanceof QuestionValidationError) {
    return { status: 400, code: "invalid_questions", message: "问题定义不合法", detail: err.issues };
  }
  if (err instanceof ClaudeTierError) return { status: 400, code: "claude_tier", message: err.message };
  if (err instanceof AuthenticationError) {
    return { status: 401, code: "jev_auth", message: "TYPESAFE_API_KEY 无效或缺失" };
  }
  if (err instanceof UnprocessableEntityError) {
    return { status: 422, code: "jev_invalid_request", message: "Jev 拒绝了请求：问题形状不合法", detail: err.body };
  }
  if (err instanceof RateLimitError || (err instanceof JevAPIError && err.status === 529)) {
    return { status: 503, code: "jev_rate_limited", message: "Jev 限流，请稍后重试", detail: err.body };
  }
  if (err instanceof JevAPIError) {
    return { status: 502, code: "jev_error", message: `Jev 请求失败（HTTP ${err.status}）`, detail: err.body };
  }
  if (err instanceof APIConnectionError) {
    return { status: 504, code: "jev_connection", message: "无法连接 Jev API（网络或超时）" };
  }
  if (err instanceof ClaudeRefusalError) {
    return { status: 422, code: "claude_refusal", message: `Claude 拒绝了该请求${err.category ? `（${err.category}）` : ""}` };
  }
  if (err instanceof ClaudeStructuredOutputError) {
    return { status: 502, code: "claude_structured_output", message: err.message, detail: err.raw };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 503, code: "bedrock_throttled", message: "Bedrock 限流，请稍后重试" };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, code: "bedrock_auth", message: "AWS 凭证不可用或无权限，检查 AWS_PROFILE 与 Bedrock 模型访问" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, code: "bedrock_error", message: `Bedrock 请求失败（HTTP ${err.status ?? "?"}）`, detail: err.message };
  }
  if (err instanceof Error && /credential|ExpiredToken|Token is expired|sso/i.test(err.message)) {
    return { status: 500, code: "aws_credentials", message: "AWS 凭证不可用或已过期，请重新登录后重试", detail: err.message };
  }
  return { status: 500, code: "internal", message: err instanceof Error ? err.message : String(err) };
}
```

`server/src/lib/usage.ts`:
```ts
import type { Trace } from "@jev/shared";

export interface UsageSnapshot {
  startedAt: string;
  jev: { calls: number; cached: number; usd: number; inputTokens: number; totalLatencyMs: number };
  claude: { calls: number; usd: number; inputTokens: number; outputTokens: number; totalLatencyMs: number };
}

function fresh(): UsageSnapshot {
  return {
    startedAt: new Date().toISOString(),
    jev: { calls: 0, cached: 0, usd: 0, inputTokens: 0, totalLatencyMs: 0 },
    claude: { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 },
  };
}

/** In-memory, per-process accumulator behind GET /api/usage. */
export function createUsage() {
  let state = fresh();
  return {
    record(trace: Trace): void {
      if (trace.kind === "jev") {
        state.jev.calls += 1;
        if (trace.cached) state.jev.cached += 1;
        state.jev.usd += trace.cost.usd;
        state.jev.inputTokens += trace.response.usage.input_tokens;
        state.jev.totalLatencyMs += trace.latencyMs;
      } else {
        state.claude.calls += 1;
        state.claude.usd += trace.cost.usd;
        state.claude.inputTokens += trace.inputTokens;
        state.claude.outputTokens += trace.outputTokens;
        state.claude.totalLatencyMs += trace.latencyMs;
      }
    },
    snapshot: (): UsageSnapshot => structuredClone(state),
    reset(): void {
      state = fresh();
    },
  };
}

export const usage = createUsage();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server`
Expected: PASS. (If `Anthropic.RateLimitError` constructor arity differs, construct via `Anthropic.APIError.generate(429, { message: "x" }, "x", new Headers())` in the test instead.)

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): error mapping and usage accumulator"
```

---

### Task 10: server — Hono app with health and usage routes

**Files:**
- Create: `server/src/app.ts`, `server/src/index.ts` (replace placeholder)
- Test: `server/src/app.test.ts`

**Interfaces:**
- Produces: `app: Hono` with `GET /api/health`, `GET /api/usage`, `POST /api/usage/reset`, `onError` → `{ error: HttpErrorBody }`; `recordTraces(traces)` helper used by later routes; static serving of `../web/dist`.

- [ ] **Step 1: Write the failing test** `server/src/app.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("app", () => {
  it("reports health with env presence and queue stats", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; queues: { jev: { limit: number } }; cacheMode: string };
    expect(body.ok).toBe(true);
    expect(body.queues.jev.limit).toBeGreaterThan(0);
    expect(["off", "read-only", "read-write"]).toContain(body.cacheMode);
  });

  it("exposes and resets usage", async () => {
    const before = (await (await app.request("/api/usage")).json()) as { jev: { calls: number } };
    expect(before.jev.calls).toBeGreaterThanOrEqual(0);
    const reset = await app.request("/api/usage/reset", { method: "POST" });
    expect(reset.status).toBe(200);
  });

  it("maps thrown errors through toHttpError", async () => {
    const res = await app.request("/api/_boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal");
    expect(body.error.message).toBe("boom");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/app.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/src/app.ts`:
```ts
import { serveStatic } from "@hono/node-server/serve-static";
import type { Trace } from "@jev/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveCacheMode } from "./lib/cache";
import { toHttpError } from "./lib/errors";
import { queues } from "./lib/queue";
import { usage } from "./lib/usage";

export const app = new Hono();

app.use("/api/*", cors());

app.onError((err, c) => {
  const e = toHttpError(err);
  if (e.status >= 500) console.error(`[api] ${c.req.method} ${c.req.path} ->`, err);
  return c.json({ error: e }, e.status as 500);
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    jevKey: Boolean(process.env.TYPESAFE_API_KEY),
    jevModel: process.env.JEV_MODEL ?? "jev-latest",
    awsProfile: process.env.AWS_PROFILE ?? null,
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    cacheMode: resolveCacheMode(),
    queues: { jev: queues.jev.stats(), claude: queues.claude.stats() },
  }),
);

app.get("/api/usage", (c) => c.json(usage.snapshot()));
app.post("/api/usage/reset", (c) => {
  usage.reset();
  return c.json({ ok: true });
});

// Test hook for the error middleware; harmless in production.
app.get("/api/_boom", () => {
  throw new Error("boom");
});

// Scenario routes are mounted here in later phases, e.g. app.route("/api/a1", a1Routes).

// Production: serve the built web app (run `npm run build` first). Dev uses Vite's proxy instead.
app.use("/*", serveStatic({ root: "../web/dist" }));

/** Record traces into the usage accumulator; routes call this before responding. */
export function recordTraces(traces: readonly Trace[]): void {
  for (const t of traces) usage.record(t);
}
```

`server/src/index.ts`:
```ts
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[jev-lab] server listening on http://localhost:${info.port}`);
  console.log(`[jev-lab] TYPESAFE_API_KEY ${process.env.TYPESAFE_API_KEY ? "set" : "MISSING"}; AWS_PROFILE=${process.env.AWS_PROFILE ?? "(default chain)"}`);
});
```

- [ ] **Step 4: Run tests, typecheck, and boot once**

Run: `npx vitest run server && npm run typecheck -w @jev/server`
Expected: PASS.

Run: `(cd server && timeout 5 npx tsx src/index.ts || true)` — on macOS without `timeout`, run `npx tsx src/index.ts & sleep 2; curl -s localhost:8787/api/health; kill %1`
Expected: JSON with `"ok":true`.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): Hono app with health, usage and error middleware"
```

---

### Task 11: scripts — check-env (real API probes)

**Files:**
- Create: `scripts/check-env.ts`

**Interfaces:**
- Consumes: `askJev` (`../server/src/lib/jev.ts`), `claudeText`/`claudeParse` (`../server/src/lib/claude.ts`), `CLAUDE_TIERS` (`../shared/src/index.ts`).
- Produces: `npm run check-env` prints one row per probe and exits 1 if the Jev probe fails.

- [ ] **Step 1: Implement** `scripts/check-env.ts`

```ts
import { z } from "zod";
import { CLAUDE_TIERS, CLAUDE_TIER_IDS } from "../shared/src/index";
import { claudeParse, claudeText } from "../server/src/lib/claude";
import { askJev } from "../server/src/lib/jev";

type Row = { probe: string; ok: boolean; model: string; latencyMs: number | null; usd: number | null; note: string };
const rows: Row[] = [];
const fmtUsd = (v: number | null) => (v === null ? "-" : `$${v.toFixed(6)}`);

async function probeJev(): Promise<boolean> {
  if (!process.env.TYPESAFE_API_KEY) {
    rows.push({ probe: "Jev", ok: false, model: "-", latencyMs: null, usd: null, note: "TYPESAFE_API_KEY 未设置（写入 .env）" });
    return false;
  }
  try {
    const { result, trace } = await askJev(
      {
        scenario: "p0",
        state: "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
        questions: { is_urgent: { type: "noul", instructions: "Does this message express urgency?" } },
      },
      { cache: "off" },
    );
    rows.push({ probe: "Jev", ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `is_urgent=${result.answers.is_urgent.noul.toFixed(2)}, tokens=${trace.response.usage.input_tokens}` });
    return true;
  } catch (err) {
    rows.push({ probe: "Jev", ok: false, model: "-", latencyMs: null, usd: null, note: (err as Error).message });
    return false;
  }
}

async function probeClaude(): Promise<void> {
  const tiers = CLAUDE_TIER_IDS.filter((id) => CLAUDE_TIERS[id].enabledByDefault || process.argv.includes("--all-tiers"));
  for (const id of tiers) {
    const tier = CLAUDE_TIERS[id];
    try {
      const { text, trace } = await claudeText({ scenario: "p0", purpose: "check-env", tier: id, maxTokens: 32, messages: [{ role: "user", content: "Reply with the single word OK." }] });
      rows.push({ probe: `${tier.label} text`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: text.trim().slice(0, 20) });
    } catch (err) {
      rows.push({ probe: `${tier.label} text`, ok: false, model: tier.modelId, latencyMs: null, usd: null, note: (err as Error).message.slice(0, 120) });
      continue;
    }
    try {
      const { parsed, trace } = await claudeParse({
        scenario: "p0",
        purpose: "check-env",
        tier: id,
        maxTokens: 64,
        messages: [{ role: "user", content: "Is the sky blue on a clear day? Answer in the required structure." }],
        schema: z.object({ ok: z.boolean() }),
      });
      rows.push({ probe: `${tier.label} parse`, ok: true, model: trace.model, latencyMs: trace.latencyMs, usd: trace.cost.usd, note: `structured output OK (${JSON.stringify(parsed)})` });
    } catch (err) {
      rows.push({ probe: `${tier.label} parse`, ok: false, model: tier.modelId, latencyMs: null, usd: null, note: `结构化输出不可用: ${(err as Error).message.slice(0, 100)}` });
    }
  }
}

const jevOk = await probeJev();
await probeClaude();

console.log("\nJev Lab 环境检查\n");
console.table(rows.map((r) => ({ ...r, latencyMs: r.latencyMs ?? "-", usd: fmtUsd(r.usd), ok: r.ok ? "✔" : "✘" })));
console.log(`AWS_PROFILE=${process.env.AWS_PROFILE ?? "(default)"} AWS_REGION=${process.env.AWS_REGION ?? "us-east-1"} JEV_CACHE=${process.env.JEV_CACHE ?? "read-write"}`);
process.exit(jevOk ? 0 : 1);
```

- [ ] **Step 2: Run with the real key**

Run: `cp -n .env.example .env` then fill `TYPESAFE_API_KEY`, then `npm run check-env`
Expected: table shows Jev ✔ with `is_urgent≈0.9+`, and for Sonnet 5 / Opus 5 / Sonnet 4.6 both `text` and `parse` rows ✔. If any `parse` row is ✘ with a 400 mentioning `output_config`, record it in `docs/scenarios/README.md` and set the strict-tool fallback as a P3 task.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-env.ts
git commit -m "feat(scripts): environment probe for Jev and Bedrock tiers"
```

---

### Task 12: scripts — vendor datasets and smoke skeleton

**Files:**
- Create: `scripts/vendor-datasets.ts`, `scripts/smoke.ts`, `shared/src/datasets/index.ts`
- Generated: `shared/src/datasets/githubTos.ts`, `shared/src/datasets/rfc7519.ts`

**Interfaces:**
- Produces: `GITHUB_TOS_LINES: string[]` (218 entries), `RFC7519_TEXT: string`; `scripts/smoke.ts` with a registry `SMOKE: Record<string, () => Promise<void>>` that later scenario modules register into via `shared/src/scenarios/<id>/smoke.ts`.

- [ ] **Step 1: Implement** `scripts/vendor-datasets.ts`

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../shared/src/datasets/", import.meta.url));

const SOURCES = [
  {
    file: "githubTos.ts",
    url: "https://gist.githubusercontent.com/eugene-shvarts/900632789a24983d5678ffd508dd01f6/raw/cf9c2ab422d568deade949ef0a06bed6896964b9/github-tos.txt",
    license: "CC0 1.0 (github/site-policy)",
    render: (text: string) => {
      const lines = text.replace(/\r\n/g, "\n").split("\n");
      if (lines.at(-1) === "") lines.pop();
      if (lines.length !== 218) throw new Error(`expected 218 lines, got ${lines.length}`);
      return `export const GITHUB_TOS_LINES: readonly string[] = ${JSON.stringify(lines, null, 2)};\n`;
    },
  },
  {
    file: "rfc7519.ts",
    url: "https://www.rfc-editor.org/rfc/rfc7519.txt",
    license: "IETF Trust Legal Provisions (BCP 78); copyright notice retained in the text",
    render: (text: string) => `export const RFC7519_TEXT: string = ${JSON.stringify(text.replace(/\r\n/g, "\n"))};\n`,
  },
];

await mkdir(outDir, { recursive: true });
for (const s of SOURCES) {
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`${s.url} -> HTTP ${res.status}`);
  const text = await res.text();
  const header = `// Generated by scripts/vendor-datasets.ts on ${new Date().toISOString().slice(0, 10)}\n// Source: ${s.url}\n// License: ${s.license}\n// Do not edit by hand; re-run \`npm run vendor\`.\n\n`;
  await writeFile(`${outDir}${s.file}`, header + s.render(text));
  console.log(`wrote ${s.file} (${text.length} chars)`);
}
```

`shared/src/datasets/index.ts`:
```ts
export { GITHUB_TOS_LINES } from "./githubTos";
export { RFC7519_TEXT } from "./rfc7519";
```

Append to `shared/src/index.ts`:
```ts
export * from "./datasets/index";
```

- [ ] **Step 2: Run vendor and verify**

Run: `npm run vendor && node -e "import('./shared/src/datasets/githubTos.ts')" 2>/dev/null; npx tsx -e "import {GITHUB_TOS_LINES,RFC7519_TEXT} from './shared/src/datasets/index.ts'; console.log(GITHUB_TOS_LINES.length, RFC7519_TEXT.length)"`
Expected: `218 63039` (RFC length ±10 if the editor re-serves with different trailing whitespace).

- [ ] **Step 3: Implement** `scripts/smoke.ts`

```ts
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
```

- [ ] **Step 4: Run** `npm run smoke -- p0` (needs `.env`)

Expected: department=technical with confidence > 0.7, is_urgent > 0.9, frustration between 0 and 1.5; latency printed.

- [ ] **Step 5: Commit**

```bash
git add scripts shared/src/datasets shared/src/index.ts
git commit -m "feat: vendor public datasets and add smoke runner skeleton"
```

---

### Task 13: web — Vite app shell, i18n, session store

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/src/main.tsx`, `web/src/index.css`, `web/src/App.tsx`, `web/src/app/Shell.tsx`, `web/src/app/scenarios.ts`, `web/src/i18n/zh.ts`, `web/src/store/session.tsx`, `web/src/lib/api.ts`, `web/src/pages/Home.tsx`, `web/src/pages/Placeholder.tsx`

**Interfaces:**
- Produces: `SCENARIOS` registry (`id, path, title, subtitle, proves, status`); `useSession()` → `{ traces, addTraces, reset, totals }`; `api.get/post` helpers that unwrap `{ error }` into `ApiError`.

- [ ] **Step 1: Static files**

`web/index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jev Lab · 学习 TypeSafe Jev</title>
  </head>
  <body class="bg-zinc-50 text-zinc-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/vite.config.ts`:
```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
});
```

`web/src/index.css`:
```css
@import "tailwindcss";

:root {
  --jev: #2563eb;
  --claude: #d97706;
}
```

- [ ] **Step 2: i18n and scenario registry**

`web/src/i18n/zh.ts`:
```ts
export const zh = {
  app: { title: "Jev Lab", subtitle: "学习 TypeSafe Jev：给代码用的判断" },
  nav: { learningPath: "学习路径", home: "总览" },
  status: { planned: "规划中", available: "可用" },
  cost: { title: "本会话费用", jev: "Jev 实际", claude: "Claude 实际", baseline: "LLM 基线估算", calls: "次调用", cached: "缓存命中", avgLatency: "平均延迟", reset: "重置" },
  inspector: { title: "请求检视器", request: "发送的请求", response: "返回", model: "模型", latency: "延迟", tokens: "tokens", cost: "费用", cached: "缓存", copy: "复制 JSON", empty: "还没有请求" },
  savings: { title: "成本对比（估算）", baseline: "若用 LLM 完成同样判断", actual: "Jev 同样 tokens 的费用", ratio: "倍", savings: "节省", assumptions: "假设", tier: "基线模型", perCallOut: "每次调用假设输出 tokens", calls: "调用次数", tokens: "输入 tokens" },
  learning: { title: "学习卡", proves: "这证明了什么", tryThis: "试试这个", pitfalls: "陷阱" },
  errors: { generic: "请求失败" },
} as const;
```

`web/src/app/scenarios.ts`:
```ts
export type ScenarioStatus = "planned" | "available";

export interface ScenarioMeta {
  id: "a1" | "a2" | "a3" | "a4" | "b1" | "b2" | "b3" | "b4";
  path: string;
  title: string;
  subtitle: string;
  proves: string;
  group: "pure" | "hybrid";
  status: ScenarioStatus;
}

/** Sidebar order = recommended learning path. */
export const SCENARIOS: ScenarioMeta[] = [
  { id: "a1", path: "/a1", title: "A1 原语实验室", subtitle: "Choice / Score / Noul 实时可视化", proves: "三种原语的返回形状；~100ms 可嵌入 UI", group: "pure", status: "planned" },
  { id: "a2", path: "/a2", title: "A2 工单分流看板", subtitle: "一次请求 10 题，阈值滑杆零推理重排", proves: "speculative fan-out 与置信度路由", group: "pure", status: "planned" },
  { id: "a4", path: "/a4", title: "A4 一致性与校准对比", subtitle: "Jev vs Claude 重复 15 轮", proves: "稳定性、延迟、成本的实测数字", group: "pure", status: "planned" },
  { id: "b1", path: "/b1", title: "B1 护栏 + 模型路由", subtitle: "Jev 在 Claude 前分流", proves: "1% 成本的前置分类器", group: "hybrid", status: "planned" },
  { id: "b2", path: "/b2", title: "B2 引用核验", subtitle: "Claude 写，Jev 查", proves: "通用验证", group: "hybrid", status: "planned" },
  { id: "a3", path: "/a3", title: "A3 文档逐行语义搜索", subtitle: "218 行 Choice + 存在性 Noul", proves: "无 embedding 的检索与 Choice 的陷阱", group: "pure", status: "planned" },
  { id: "b3", path: "/b3", title: "B3 RAG 段落守门人", subtitle: "四个 Noul 过滤证据与注入", proves: "上下文选择与安全护栏", group: "hybrid", status: "planned" },
  { id: "b4", path: "/b4", title: "B4 智能家居助手", subtitle: "14 个 speculative 问题驱动 UI", proves: "带概率的 function calling", group: "hybrid", status: "planned" },
];
```

- [ ] **Step 3: Session store and API helper**

`web/src/store/session.tsx`:
```tsx
import type { Trace } from "@jev/shared";
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

interface SessionState {
  traces: Trace[];
}

type Action = { type: "add"; traces: Trace[] } | { type: "reset" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "add":
      return { traces: [...state.traces, ...action.traces] };
    case "reset":
      return { traces: [] };
  }
}

export interface SessionTotals {
  jevUsd: number;
  claudeUsd: number;
  jevCalls: number;
  jevCached: number;
  claudeCalls: number;
  avgJevLatencyMs: number;
  avgClaudeLatencyMs: number;
}

interface SessionValue {
  traces: Trace[];
  addTraces: (traces: Trace[]) => void;
  reset: () => void;
  totals: SessionTotals;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { traces: [] });
  const addTraces = useCallback((traces: Trace[]) => dispatch({ type: "add", traces }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const totals = useMemo<SessionTotals>(() => {
    const jev = state.traces.filter((t) => t.kind === "jev");
    const live = jev.filter((t) => !t.cached);
    const claude = state.traces.filter((t) => t.kind === "claude");
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      jevUsd: jev.reduce((s, t) => s + t.cost.usd, 0),
      claudeUsd: claude.reduce((s, t) => s + t.cost.usd, 0),
      jevCalls: jev.length,
      jevCached: jev.length - live.length,
      claudeCalls: claude.length,
      avgJevLatencyMs: avg(live.map((t) => t.latencyMs)),
      avgClaudeLatencyMs: avg(claude.map((t) => t.latencyMs)),
    };
  }, [state.traces]);
  const value = useMemo(() => ({ traces: state.traces, addTraces, reset, totals }), [state.traces, addTraces, reset, totals]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
```

`web/src/lib/api.ts`:
```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: { status: number; code: string; message: string; detail?: unknown } };
  if (!res.ok) {
    const e = body.error ?? { status: res.status, code: "http", message: res.statusText };
    throw new ApiError(e.status, e.code, e.message, e.detail);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => fetch(path).then(handle<T>),
  post: <T>(path: string, json: unknown) =>
    fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) }).then(handle<T>),
};
```

- [ ] **Step 4: Shell, pages, App, main**

`web/src/app/Shell.tsx`:
```tsx
import { NavLink, Outlet } from "react-router";
import { CostMeter } from "../components/CostMeter";
import { zh } from "../i18n/zh";
import { SCENARIOS } from "./scenarios";

export function Shell() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-4">
        <NavLink to="/" className="block">
          <div className="text-lg font-semibold">{zh.app.title}</div>
          <div className="text-xs text-zinc-500">{zh.app.subtitle}</div>
        </NavLink>
        <div className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-400">{zh.nav.learningPath}</div>
        <nav className="mt-2 space-y-1">
          {SCENARIOS.map((s) => (
            <NavLink
              key={s.id}
              to={s.path}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${isActive ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-100"}`
              }
            >
              <div className="flex items-center justify-between">
                <span>{s.title}</span>
                <span className={`text-[10px] ${s.status === "available" ? "text-emerald-600" : "text-zinc-400"}`}>{zh.status[s.status]}</span>
              </div>
              <div className="text-xs text-zinc-500">{s.subtitle}</div>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-zinc-200 bg-white px-6 py-2">
          <CostMeter />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

`web/src/pages/Home.tsx`:
```tsx
import { Link } from "react-router";
import { SCENARIOS } from "../app/scenarios";

export function Home() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Jev Lab</h1>
      <p className="mt-2 text-zinc-600">
        Jev 是 TypeSafe 的 System One 模型：不生成文本，只回答类型化问题并返回校准过的概率。下面 8 个场景按学习路径排列，
        每个场景都会展示发送给 Jev 的原始问题、返回的概率、延迟与费用，以及"如果用 LLM 做同样的事"的成本基线。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SCENARIOS.map((s) => (
          <Link key={s.id} to={s.path} className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-blue-300">
            <div className="flex items-center justify-between">
              <div className="font-medium">{s.title}</div>
              <span className={`text-xs ${s.group === "hybrid" ? "text-amber-600" : "text-blue-600"}`}>{s.group === "hybrid" ? "Jev + Claude" : "纯 Jev"}</span>
            </div>
            <div className="mt-1 text-sm text-zinc-600">{s.subtitle}</div>
            <div className="mt-2 text-xs text-zinc-500">证明：{s.proves}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

`web/src/pages/Placeholder.tsx`:
```tsx
import { useParams } from "react-router";
import { SCENARIOS } from "../app/scenarios";

export function Placeholder() {
  const { id } = useParams();
  const meta = SCENARIOS.find((s) => s.id === id);
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <div className="text-lg font-medium">{meta?.title ?? id}</div>
      <p className="mt-2 text-zinc-600">{meta?.subtitle}</p>
      <p className="mt-4 text-sm text-zinc-500">该场景尚在规划中。证明点：{meta?.proves}</p>
    </div>
  );
}
```

`web/src/App.tsx`:
```tsx
import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./app/Shell";
import { Home } from "./pages/Home";
import { Placeholder } from "./pages/Placeholder";
import { SessionProvider } from "./store/session";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path=":id" element={<Placeholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Components used by the shell (CostMeter placeholder until Task 14)** — create `web/src/components/CostMeter.tsx` in Task 14 first, or temporarily export `export function CostMeter() { return null; }`. Then:

Run: `npm run typecheck -w @jev/web && (cd web && npx vite build)`
Expected: typecheck passes; build emits `web/dist`.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): Vite + React shell with learning-path navigation and session store"
```

---

### Task 14: web — CostMeter, RequestInspector, SavingsCard, LatencyChip, LearningCard

**Files:**
- Create: `web/src/components/CostMeter.tsx`, `web/src/components/RequestInspector.tsx`, `web/src/components/SavingsCard.tsx`, `web/src/components/LatencyChip.tsx`, `web/src/components/LearningCard.tsx`, `web/src/lib/format.ts`

**Interfaces:**
- Consumes: `useSession`, `estimateLlmBaseline`, `CLAUDE_TIERS`, `CLAUDE_TIER_IDS`, `Trace`, `JevTrace`, `ScenarioId`, `ClaudeTierId`.
- Produces: `<CostMeter />`, `<RequestInspector traces />`, `<SavingsCard scenario jevTraces defaultTier? />`, `<LatencyChip ms cached? />`, `<LearningCard title proves tryThis pitfalls />`, `fmtUsd(n)`, `fmtMs(n)`, `fmtPct(n)`.

- [ ] **Step 1: Implement**

`web/src/lib/format.ts`:
```ts
export const fmtUsd = (n: number): string => (n === 0 ? "$0" : n < 0.001 ? `$${n.toFixed(6)}` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
export const fmtMs = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
export const fmtPct = (n: number): string => `${n.toFixed(n >= 99 ? 2 : 1)}%`;
export const fmtRatio = (n: number | null): string => (n === null ? "—" : n >= 100 ? `${Math.round(n)}×` : `${n.toFixed(1)}×`);
```

`web/src/components/LatencyChip.tsx`:
```tsx
import { fmtMs } from "../lib/format";

export function LatencyChip({ ms, cached = false, kind = "jev" }: { ms: number; cached?: boolean; kind?: "jev" | "claude" }) {
  const color = kind === "jev" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs ${cached ? "bg-zinc-100 text-zinc-500" : color}`}>
      {cached ? "缓存" : fmtMs(ms)}
    </span>
  );
}
```

`web/src/components/CostMeter.tsx`:
```tsx
import { zh } from "../i18n/zh";
import { fmtMs, fmtUsd } from "../lib/format";
import { useSession } from "../store/session";

export function CostMeter() {
  const { totals, reset } = useSession();
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-zinc-500">{zh.cost.title}</span>
      <Stat label={zh.cost.jev} value={fmtUsd(totals.jevUsd)} sub={`${totals.jevCalls} ${zh.cost.calls} · ${totals.jevCached} ${zh.cost.cached} · ${fmtMs(totals.avgJevLatencyMs)}`} tone="jev" />
      <Stat label={zh.cost.claude} value={fmtUsd(totals.claudeUsd)} sub={`${totals.claudeCalls} ${zh.cost.calls} · ${fmtMs(totals.avgClaudeLatencyMs)}`} tone="claude" />
      <button type="button" onClick={reset} className="rounded border border-zinc-200 px-2 py-1 text-zinc-500 hover:bg-zinc-50">
        {zh.cost.reset}
      </button>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "jev" | "claude" }) {
  return (
    <div className="text-right">
      <div className={`font-mono text-sm ${tone === "jev" ? "text-blue-700" : "text-amber-700"}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">
        {label} · {sub}
      </div>
    </div>
  );
}
```

`web/src/components/RequestInspector.tsx`:
```tsx
import type { Trace } from "@jev/shared";
import { useState } from "react";
import { zh } from "../i18n/zh";
import { fmtUsd } from "../lib/format";
import { LatencyChip } from "./LatencyChip";

export function RequestInspector({ traces }: { traces: Trace[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-2 text-sm font-medium">{zh.inspector.title}</div>
      {traces.length === 0 ? (
        <div className="px-4 py-3 text-sm text-zinc-400">{zh.inspector.empty}</div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {traces.map((t) => (
            <li key={t.id} className="px-4 py-2 text-sm">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.kind === "jev" ? "bg-blue-600 text-white" : "bg-amber-500 text-white"}`}>{t.kind === "jev" ? "Jev" : "Claude"}</span>
                <span className="font-mono text-xs text-zinc-600">{t.model}</span>
                {t.kind === "claude" && <span className="text-xs text-zinc-500">{t.purpose}</span>}
                <LatencyChip ms={t.latencyMs} cached={t.kind === "jev" && t.cached} kind={t.kind} />
                <span className="font-mono text-xs text-zinc-500">
                  {t.kind === "jev" ? `${t.response.usage.input_tokens} tok` : `${t.inputTokens}+${t.outputTokens} tok`}
                </span>
                <span className="ml-auto font-mono text-xs">{fmtUsd(t.cost.usd)}</span>
              </button>
              {open === t.id && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <Json title={zh.inspector.request} value={t.kind === "jev" ? t.request : { tier: t.tier, model: t.model, purpose: t.purpose }} />
                  <Json title={zh.inspector.response} value={t.kind === "jev" ? t.response : { stopReason: t.stopReason, inputTokens: t.inputTokens, outputTokens: t.outputTokens }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>{title}</span>
        <button type="button" className="hover:text-zinc-800" onClick={() => void navigator.clipboard.writeText(text)}>
          {zh.inspector.copy}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded bg-zinc-900 p-3 text-[11px] leading-snug text-zinc-100">{text}</pre>
    </div>
  );
}
```

`web/src/components/SavingsCard.tsx`:
```tsx
import { CLAUDE_TIERS, CLAUDE_TIER_IDS, estimateLlmBaseline, type ClaudeTierId, type JevTrace, type ScenarioId } from "@jev/shared";
import { useMemo, useState } from "react";
import { zh } from "../i18n/zh";
import { fmtPct, fmtRatio, fmtUsd } from "../lib/format";

export function SavingsCard({ scenario, jevTraces, defaultTier = "standard" }: { scenario: ScenarioId; jevTraces: JevTrace[]; defaultTier?: ClaudeTierId }) {
  const [tier, setTier] = useState<ClaudeTierId>(defaultTier);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const est = useMemo(() => estimateLlmBaseline(scenario, jevTraces, tier), [scenario, jevTraces, tier]);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{zh.savings.title}</div>
        <select className="rounded border border-zinc-200 px-2 py-1 text-xs" value={tier} onChange={(e) => setTier(e.target.value as ClaudeTierId)}>
          {CLAUDE_TIER_IDS.map((id) => (
            <option key={id} value={id}>
              {CLAUDE_TIERS[id].label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="font-mono text-lg text-amber-700">{fmtUsd(est.llmUsd)}</div>
          <div className="text-[11px] text-zinc-500">{zh.savings.baseline}</div>
        </div>
        <div>
          <div className="font-mono text-lg text-blue-700">{fmtUsd(est.jevUsd)}</div>
          <div className="text-[11px] text-zinc-500">{zh.savings.actual}</div>
        </div>
        <div>
          <div className="font-mono text-lg text-emerald-700">{est.calls ? `${fmtPct(est.savingsPct)} · ${fmtRatio(est.ratio)}` : "—"}</div>
          <div className="text-[11px] text-zinc-500">{zh.savings.savings}</div>
        </div>
      </div>
      <button type="button" className="mt-3 text-xs text-zinc-500 underline" onClick={() => setShowAssumptions(!showAssumptions)}>
        {zh.savings.assumptions}
      </button>
      {showAssumptions && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
          <dt>{zh.savings.tier}</dt>
          <dd>{est.tierLabel}（${CLAUDE_TIERS[tier].inUsdPerMtok}/${CLAUDE_TIERS[tier].outUsdPerMtok} 每 Mtok）</dd>
          <dt>{zh.savings.calls}</dt>
          <dd>{est.calls}</dd>
          <dt>{zh.savings.tokens}</dt>
          <dd>{est.inputTokens}（与发给 Jev 的完全相同）</dd>
          <dt>{zh.savings.perCallOut}</dt>
          <dd>{est.assumption.outputTokensPerCall}</dd>
          <dt>被替代的工作</dt>
          <dd>{est.assumption.title_zh}</dd>
          <dt>说明</dt>
          <dd>{est.assumption.note_zh}</dd>
        </dl>
      )}
    </section>
  );
}
```

`web/src/components/LearningCard.tsx`:
```tsx
import { zh } from "../i18n/zh";

export function LearningCard({ title, proves, tryThis, pitfalls }: { title?: string; proves: string[]; tryThis: string[]; pitfalls: string[] }) {
  return (
    <aside className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 text-sm">
      <div className="font-medium text-blue-900">{title ?? zh.learning.title}</div>
      <Block heading={zh.learning.proves} items={proves} />
      <Block heading={zh.learning.tryThis} items={tryThis} />
      <Block heading={zh.learning.pitfalls} items={pitfalls} />
    </aside>
  );
}

function Block({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium uppercase tracking-wide text-blue-700">{heading}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Build and smoke the shell in a browser**

Run: `npm run dev` (in background) then open `http://localhost:5173/` with Playwright MCP; take a screenshot to `docs/screenshots/p0-shell.png`; verify the sidebar lists 8 scenarios in the learning-path order and the CostMeter shows `$0`.
Expected: no console errors; `/api/health` proxied (check `curl localhost:5173/api/health`).

- [ ] **Step 3: Commit**

```bash
git add web docs/screenshots
git commit -m "feat(web): cost meter, request inspector, savings card, learning card"
```

---

### Task 15: docs 00–05 and README

**Files:**
- Create: `docs/00-什么是Jev.md`, `docs/01-三种原语.md`, `docs/02-置信度与阈值.md`, `docs/03-与LLM的差异与局限.md`, `docs/04-设计模式.md`, `docs/05-成本模型.md`, `docs/scenarios/README.md`, `README.md`

**Interfaces:** none (prose). Each doc must include: a one-paragraph summary, the official URLs it draws from, and a "在本项目里" section pointing at the scenario/page that exercises the concept. Required content per file:

- `00`: System One 定义；RLCD vs RLHF/RLVR；"给代码用的判断"；价格 $0.042/Mtok、~100–150ms、64k/32k、1200 rpm、仅文本、英文为主；与 LLM 差异表；何时不该用 Jev（生成、算数、日期、多跳）。URLs: `/concepts/system-one`, `/introduction/machine-learning-primer`, `/models`.
- `01`: 三种原语的请求/响应字段表；选型规则（Choice 无序集合、Score 有序量表、Noul 是否）；Noul 0.5 ≠ 中等；Score 级别描述情境；`{what, not_for, examples}` 结构化 criteria；反引号路径；255 选项 / 10 级上限；问题 ID 不发给模型。URLs: `/primitives`, `/primitives/choice|score|noul|advanced`.
- `02`: confidence 由分布形状导出；三段式（高→自动、中→确认、低→人工）；阈值随风险（查余额 0.6 vs 转账 0.85）；Noul 无 confidence；本项目阈值常量都在 `shared/src/scenarios/*/thresholds.ts`。URLs: `/confidence`, `/patterns/confidence-routing`.
- `03`: jaggedness 九条与对策表；一致性 vs 确定性（cookbook：Jev 8 题标签一致率 90.8%，均值标准差 0.0098）；CJK 提示；官方对比数字表（114ms/$0.000046 vs Haiku 3.85s/$0.0035 vs Opus 4.8 推理 10.4s/$0.028）。URLs: `/model-jaggedness/jev-1.13`, `/cookbooks/consistency_choice_cookbook`.
- `04`: fan-out、confidence routing、composite scoring、intent routing、cascade、verify —— 各一段，注明对应场景（A2、B1、A2、B1、B2/B3、B2）。URLs: `/patterns/*`, `/cookbooks/sde_cascade`, `/cookbooks/citation_check`.
- `05`: 复制设计稿 §5 的表；方法说明（输入 tokens 取自真实 Jev 请求，输出 tokens 为常量，价格表）；"判断步骤两个数量级、端到端 30–65%"结论；实测回填表（空表，列：场景、实测 Jev 费用、实测/估算 LLM 费用、比例、日期）。
- `docs/scenarios/README.md`: 8 个场景一行简介 + 链接占位（`A1.md` … `B4.md` 在各阶段创建）+ P0 check-env 结果记录表。
- `README.md`: 项目定位（2 段）；安装（`npm install`、`cp .env.example .env` 填 key、`claude plugin marketplace add typesafe-ai/skills` + `claude plugin install typesafe@typesafe-ai`）；`npm run check-env`、`npm run dev`、`npm run smoke -- p0`、`npm test`；目录说明；学习路径顺序与每场景一句话；文档索引。

- [ ] **Step 1: Write the eight files** with the content above (prose in Chinese; keep every number consistent with `docs/superpowers/specs/2026-09-22-jev-lab-design.md`).

- [ ] **Step 2: Verify links and numbers**

Run: `grep -n "0.042\|1200\|64k\|114" docs/0*.md | head` and open each file once.
Expected: numbers match the spec; every doc has a URLs section.

- [ ] **Step 3: Commit**

```bash
git add docs README.md
git commit -m "docs: Jev teaching notes 00-05, scenario index, README"
```

---

### Task 16: P0 verification gate

- [ ] `npm test` → all shared + server tests green.
- [ ] `npm run typecheck` → three packages pass.
- [ ] `npm run check-env` → Jev ✔; Sonnet 5 / Opus 5 / Sonnet 4.6 text ✔ and parse ✔ (record any ✘ in `docs/scenarios/README.md`).
- [ ] `npm run smoke -- p0` → sensible answers with latency and cost.
- [ ] `npm run dev` → shell renders at `http://localhost:5173`, sidebar in learning order, CostMeter visible, `/api/health` proxied; screenshot saved to `docs/screenshots/p0-shell.png`.
- [ ] `git status` clean; `server/.cache/jev/` contains the smoke trace JSON (committed).
- [ ] Commit: `git commit -m "chore: P0 foundation verified"`.
