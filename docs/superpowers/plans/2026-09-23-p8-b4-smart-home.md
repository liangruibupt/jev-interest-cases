# P8 · B4 自然语言智能家居助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the B4 page: a natural-language smart-home assistant where one Jev request with 14 speculative questions drives the UI directly ("function calling with a probability on every parameter"). Numbers are parsed by regex, high-risk actions (door lock) need a higher confidence and an explicit confirmation, and Claude only appears to split compound requests and to answer chit-chat / state questions.

**Architecture:** `shared/src/scenarios/b4-smart-home/` holds the house model + reducer, the 20 example requests, the 14 questions, thresholds, the number extractor and the pure `dispatch()` that turns answers into commands / clarification / confirmation / split / chat. `POST /api/b4/command` runs Jev once, dispatches, and calls Claude only for split (`claudeParse` → string[] then one more Jev request per part) or chat/state answers (`claudeText`). The browser owns the house state, renders an SVG floor plan and applies the returned commands with the reducer.

**Spec:** `docs/superpowers/specs/2026-09-22-jev-lab-design.md` §4 B4, §5 (B4 rows).

## Global Constraints

- One Jev request per user request with all 14 questions (speculative fan-out); a second round only after Claude has split a compound request into parts (new state per part — the documented exception, shown in the trace as such).
- Thresholds in `thresholds.ts`: `categoryMin 0.5, compound 0.7, roomMin 0.5, deviceMin 0.6, actionMin 0.5, lockMin 0.85`.
- Jev never reads numbers: `numbers.ts` extracts `21 degrees / 21°C / 30% / level 3`; Jev only answers `mentions_number` and which device it belongs to.
- Lock / unlock commands are never applied without `confirmed: true` from the client unless `lock_action.confidence ≥ lockMin`; even then the UI shows a confirm step for unlock.
- Example requests use Jev cache `read-write`; free text `read-only`. Claude calls are cached in memory per request text.
- English requests, Chinese UI.

---

### Task 1: shared — house model, examples, questions, numbers, dispatch

**Files:** `shared/src/scenarios/b4-smart-home/{home,examples,questions,thresholds,numbers,dispatch,index}.ts` + `home.test.ts`, `numbers.test.ts`, `dispatch.test.ts`, `questions.test.ts`; export from `shared/src/index.ts`.

```ts
export const ROOMS = ["living_room", "kitchen", "bedroom", "bathroom", "office"] as const;
export type RoomId = (typeof ROOMS)[number];
export type Brightness = "off" | "dim" | "medium" | "bright";
export type LightColor = "white" | "warm_white" | "red" | "blue" | "green" | "purple";
export interface RoomState { lights: { on: boolean; brightness: Brightness; color: LightColor }; thermostat: { targetC: number }; blinds: { open: boolean }; speaker: { playing: boolean; volume: number }; tv: { on: boolean } }
export interface HomeState { rooms: Record<RoomId, RoomState>; front_door_lock: { locked: boolean } }
export const INITIAL_HOME: HomeState;
export type Command =
  | { type: "lights"; room: RoomId | "all"; on?: boolean; brightness?: Brightness; brightnessPercent?: number; color?: LightColor }
  | { type: "thermostat"; room: RoomId | "all"; targetC?: number; delta?: number }
  | { type: "blinds"; room: RoomId | "all"; open: boolean }
  | { type: "speaker"; room: RoomId | "all"; playing?: boolean; volume?: number }
  | { type: "tv"; room: RoomId | "all"; on: boolean }
  | { type: "lock"; locked: boolean };
export function applyCommand(home: HomeState, cmd: Command): HomeState;      // pure, returns a new object
export function describeCommand(cmd: Command): string;                       // Chinese log line, e.g. "卧室灯 → 调暗（30%）"
export const ROOM_LABELS_ZH: Record<RoomId | "all", string>;
export const EXAMPLE_REQUESTS: { text: string; note_zh: string; expect: "commands" | "clarify" | "confirm_lock" | "split" | "chat" | "state_question" }[];  // 20
export const B4_QUESTIONS_FOR = (home: HomeState) => Questions;             // 14 questions (rooms list from home)
export function buildRequestState(request: string, home: HomeState): { request: string; rooms: string[]; devices: string[] };
export const B4_THRESHOLDS = { categoryMin: 0.5, compound: 0.7, roomMin: 0.5, deviceMin: 0.6, actionMin: 0.5, lockMin: 0.85 };
export interface ExtractedNumber { value: number; unit: "celsius" | "percent" | "level" | "bare" }
export function extractNumber(text: string): ExtractedNumber | null;
export type Dispatch =
  | { kind: "commands"; commands: Command[]; trace: DispatchTrace }
  | { kind: "confirm_lock"; command: Extract<Command, { type: "lock" }>; confidence: number; trace: DispatchTrace }
  | { kind: "clarify"; question_zh: string; trace: DispatchTrace }
  | { kind: "split"; trace: DispatchTrace }
  | { kind: "chat"; trace: DispatchTrace }
  | { kind: "state_question"; trace: DispatchTrace };
export interface DispatchTrace { category: { choice: string; confidence: number }; compound: number; room?: { choice: string; confidence: number }; device?: { choice: string; confidence: number }; action?: { id: string; choice: string; confidence: number }; number: ExtractedNumber | null; ignored: string[]; rule_zh: string }
export function dispatch(answers: Answers, request: string, t?: typeof B4_THRESHOLDS): Dispatch;
```

**14 questions (exact wording; criteria as null unless given):**
- `category` Choice "What kind of request is `request`?" · device_command "Asks to change the state of a light, thermostat, blinds, speaker, TV or door lock" · information_question "Asks about the current state of the home or a device" · chit_chat "Greeting, thanks, or small talk with no home action" · other.
- `is_compound` Noul "Does `request` ask for more than one distinct action, possibly in different rooms?" · true "Two or more separate actions joined by and/then/also, or for different devices" · false "A single action, even if it applies to several rooms at once".
- `room` Choice "Which room does `request` refer to?" · options = `rooms` + whole_house "The whole home, all rooms, or everywhere" + not_stated "No room is named or implied".
- `device` Choice "Which device does `request` want to control or ask about?" · lights / thermostat / blinds / speaker / tv / front_door_lock / not_stated.
- `light_action` Choice "If `request` is about lights, what should happen?" · turn_on / turn_off / change_brightness / change_color / not_applicable.
- `brightness_level` Choice "If `request` sets a brightness level in words, which one?" · dim / medium / bright / not_stated "No level in words (a percentage counts as not stated)".
- `color` Choice "If `request` names a light color, which one?" · white / warm_white / red / blue / green / purple / not_stated.
- `thermostat_action` Choice "If `request` is about temperature, what should happen?" · set_specific "Set to a specific temperature" · warmer / cooler / not_applicable.
- `blinds_action` Choice · open / close / not_applicable.
- `speaker_action` Choice · play / pause_or_stop / volume_up / volume_down / set_volume / not_applicable.
- `tv_action` Choice · turn_on / turn_off / not_applicable.
- `lock_action` Choice "If `request` is about the front door, what should happen?" · lock / unlock / not_applicable.
- `mentions_number` Noul "Does `request` contain a specific number for a temperature, percentage, or volume level?"
- `is_question_about_state` Noul "Is `request` asking what the current state of something is, rather than asking to change it?"

**Dispatch rules (ordered):** (1) `category.confidence < categoryMin` → clarify "没听懂：是想控制设备、询问状态，还是聊天？" · (2) `category = chit_chat` → chat · (3) `category = information_question` or `is_question_about_state ≥ 0.7` → state_question · (4) `is_compound ≥ compound` → split · (5) device `not_stated` or `device.confidence < deviceMin` → clarify "要控制哪个设备？" · (6) room `not_stated` for a room-scoped device (all but the lock) or `room.confidence < roomMin` → clarify "哪个房间？" · (7) device = front_door_lock: action lock/unlock; `lock_action.confidence < lockMin` → confirm_lock (UI asks); unlock always → confirm_lock; lock with confidence ≥ lockMin → commands · (8) build the command from the device's action Choice (`confidence < actionMin` → clarify "对{设备}做什么？"); numbers: thermostat set_specific uses `extractNumber().value` (clarify if none), light change_brightness uses percent if present else `brightness_level` (dim 30 / medium 60 / bright 100), speaker set_volume uses the number; `ignored` lists every speculative answer that was not used (e.g. `tv_action` when device = lights).

**Examples (20):** "turn off all the lights" (commands, whole_house) · "dim the office lights to 30%" (commands, percent) · "make the bedroom warmer" (commands, delta +2) · "set the bedroom to 21 degrees" (commands, number) · "turn the living room lights blue" (commands) · "open the blinds in the kitchen" (commands) · "play some music in the bathroom" (commands) · "turn the TV off" (clarify — no room) · "make it brighter" (clarify — no room; device lights) · "lock the front door" (commands or confirm_lock) · "unlock the front door" (confirm_lock) · "turn off the kitchen lights and close the bedroom blinds" (split) · "good morning! open the blinds and warm up the office" (split) · "is the front door locked?" (state_question) · "what temperature is the bedroom set to?" (state_question) · "thanks, that's all" (chat) · "hi there" (chat) · "set the office volume to 4" (commands, bare number) · "turn everything off in the living room" (commands or split — see what Jev says) · "make the bathroom lights warm white and dim" (split or commands).

- [ ] Tests: `home.test.ts` (reducer immutability; `all` fans out to five rooms; lock toggles; brightnessPercent 30 → dim, 60 → medium, 100 → bright mapping); `numbers.test.ts` ("21 degrees" → 21 celsius; "21°C"; "30%" → percent; "volume to 4" → bare 4; "no numbers" → null; "2 lights" is not a temperature — pick the first number attached to a unit, else the first bare number); `dispatch.test.ts` with an `answers()` fixture builder: each rule at its boundary (category conf 0.49 → clarify; compound 0.7 → split; device conf 0.59 → clarify; room not_stated → clarify; lock conf 0.84 → confirm_lock; unlock → confirm_lock; thermostat set_specific without number → clarify; percent overrides brightness_level; `ignored` non-empty); `questions.test.ts` (14 ids; validate; room options = ROOMS + 2).
- [ ] FAIL → implement → PASS → commit `feat(shared): B4 house model, examples, questions, numbers, dispatch`.

### Task 2: server — `/api/b4/command`

`createB4Routes({ askJev, claudeText, claudeParse })`; `POST /command { request, home: HomeState, confirmed?: boolean }` (request ≤ 300 chars) → run Jev with `B4_QUESTIONS_FOR(home)` on `buildRequestState`; `dispatch()`; then: `split` → `claudeParse` schema `{ parts: string[] (2..5) }` with system "Split the smart-home request into independent single-action requests, one per array item, keeping room names in each part" (`effort low`, `maxTokens 300`), then one Jev request per part (cache like the parent) and `dispatch()` each, collecting commands / clarifications; `chat` → `claudeText` (friendly one-sentence reply, ≤ 40 words); `state_question` → `claudeText` with the home JSON in the prompt ("Answer from HOME_STATE only, one sentence"); `confirm_lock` with `confirmed: true` → commands. Response `{ decision: Dispatch | { kind: "split"; parts: { text: string; decision: Dispatch }[] }, commands: Command[], reply?: string, clarification?: string, traces, baseline: { functionCallingUsd: number } }` where `functionCallingUsd = claudeCostUsd("standard", jevInputTokens, 120)`. Tests with mocks: single command → 1 Jev call, no Claude; compound → claudeParse + N Jev calls; chit-chat → claudeText only; unlock → confirm_lock and no command until confirmed; free text read-only. Mount `/api/b4`. Commit.

### Task 3: web — floor plan + trace

`web/src/pages/B4SmartHome.tsx`, `web/src/components/FloorPlan.tsx`; `App.tsx`, `scenarios.ts` (b4 available), `zh.ts`. Layout: left 3/5 — SVG floor plan (5 rooms in a 3+2 grid; light bulb glyph filled with the colour at opacity by brightness; thermostat number; blinds as horizontal stripes open/closed; speaker with note glyph when playing; TV rectangle lit when on; front door with lock glyph), under it the command bar (input + 20 example chips grouped 指令 / 复合 / 询问 / 闲聊 / 需确认) and the event log (each line: request → decision → commands applied, with Jev ms and Claude ms). Right 2/5 — DecisionTrace-like panel for the last request: category ProbBars + ConfidenceRing, compound NoulMeter, room/device ProbBars, chosen action ProbBars, number chip, fired rule, "被忽略的 speculative 答案" collapsible; confirm dialog for lock (按钮 确认 / 取消); SavingsCard b4; RequestInspector; LearningCard. Playwright: "turn off all the lights" → all five bulbs dark; "unlock the front door" → confirm dialog; "turn off the kitchen lights and close the bedroom blinds" → split → two commands; screenshot `docs/screenshots/b4-home.png`. Commit.

### Task 4: smoke, docs, gate, merge

Smoke `b4`: Jev only over the 20 examples (cache off): print `text / category+conf / compound / room / device / action / number / dispatch kind`, assert ≥ 16/20 match `expect` (where `expect` allows the listed alternatives), lock examples never produce `commands` for unlock. `docs/scenarios/B4.md` with the measured table, three page runs (single, compound with Claude split, state question), cost table (pure device command vs Sonnet 5 function calling; mixed traffic). Update index/README/cost; warm-cache examples; gate; review; ff-merge.
