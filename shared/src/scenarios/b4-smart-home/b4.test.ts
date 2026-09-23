import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import { B4_QUESTION_IDS, B4_THRESHOLDS, EXAMPLE_REQUESTS, INITIAL_HOME, ROOMS, applyCommand, buildB4Questions, buildRequestState, describeCommand, dispatch, extractNumber, percentToBrightness } from "./index";

type Over = Partial<Record<string, { choice: string; confidence?: number } | number>>;
function answers(over: Over): Answers {
  const base: Record<string, { choice: string; confidence?: number } | number> = {
    category: { choice: "device_command", confidence: 0.95 },
    is_compound: 0.05,
    room: { choice: "bedroom", confidence: 0.9 },
    device: { choice: "lights", confidence: 0.9 },
    light_action: { choice: "turn_on", confidence: 0.9 },
    brightness_level: { choice: "not_stated", confidence: 0.9 },
    color: { choice: "not_stated", confidence: 0.9 },
    thermostat_action: { choice: "not_applicable", confidence: 0.9 },
    blinds_action: { choice: "not_applicable", confidence: 0.9 },
    speaker_action: { choice: "not_applicable", confidence: 0.9 },
    tv_action: { choice: "not_applicable", confidence: 0.9 },
    lock_action: { choice: "not_applicable", confidence: 0.9 },
    mentions_number: 0.05,
    is_question_about_state: 0.05,
    ...over,
  };
  const out: Answers = {};
  for (const [id, v] of Object.entries(base)) {
    if (typeof v === "number") out[id] = { type: "noul", noul: v };
    else out[id] = { type: "choice", choice: v.choice, probabilities: { [v.choice]: 1 }, confidence: v.confidence ?? 0.9 };
  }
  return out;
}

describe("B4 home reducer", () => {
  it("applies commands immutably, fans out `all`, maps percentages to levels", () => {
    const off = applyCommand(INITIAL_HOME, { type: "lights", room: "all", on: false });
    expect(INITIAL_HOME.rooms.kitchen.lights.on).toBe(true);
    expect(ROOMS.every((r) => !off.rooms[r].lights.on && off.rooms[r].lights.brightness === "off")).toBe(true);
    const dim = applyCommand(INITIAL_HOME, { type: "lights", room: "office", brightnessPercent: 30 });
    expect(dim.rooms.office.lights).toMatchObject({ on: true, brightness: "dim" });
    expect(percentToBrightness(0)).toBe("off");
    expect(percentToBrightness(60)).toBe("medium");
    expect(percentToBrightness(100)).toBe("bright");
    const blue = applyCommand(INITIAL_HOME, { type: "lights", room: "bedroom", color: "blue" });
    expect(blue.rooms.bedroom.lights).toMatchObject({ on: true, color: "blue", brightness: "medium" });
    const warm = applyCommand(INITIAL_HOME, { type: "thermostat", room: "bedroom", delta: 2 });
    expect(warm.rooms.bedroom.thermostat.targetC).toBe(21);
    expect(applyCommand(INITIAL_HOME, { type: "thermostat", room: "bedroom", targetC: 99 }).rooms.bedroom.thermostat.targetC).toBe(30);
    expect(applyCommand(INITIAL_HOME, { type: "lock", locked: true }).front_door_lock.locked).toBe(true);
    expect(applyCommand(INITIAL_HOME, { type: "speaker", room: "office", volumeDelta: 2 }).rooms.office.speaker.volume).toBe(6);
    expect(describeCommand({ type: "lights", room: "office", brightnessPercent: 30 })).toBe("书房灯 → 亮度 30%（暗）");
    expect(describeCommand({ type: "lock", locked: false })).toBe("前门 → 开锁");
  });
});

describe("B4 numbers", () => {
  it("prefers unit-tagged numbers and falls back to bare ones", () => {
    expect(extractNumber("set the bedroom to 21 degrees")).toEqual({ value: 21, unit: "celsius" });
    expect(extractNumber("set it to 21°C")).toEqual({ value: 21, unit: "celsius" });
    expect(extractNumber("dim the office lights to 30%")).toEqual({ value: 30, unit: "percent" });
    expect(extractNumber("set the office volume to 4")).toEqual({ value: 4, unit: "level" });
    expect(extractNumber("turn on 2 lights")).toEqual({ value: 2, unit: "bare" });
    expect(extractNumber("no numbers here")).toBeNull();
  });
});

describe("B4 questions", () => {
  it("has 14 valid questions with the room options derived from the house", () => {
    const q = buildB4Questions();
    expect(validateQuestions(q)).toEqual([]);
    expect(Object.keys(q)).toEqual([...B4_QUESTION_IDS]);
    const room = q.room!;
    if (room.type !== "choice") throw new Error("room must be a choice");
    expect(Object.keys(room.criteria)).toEqual([...ROOMS, "whole_house", "not_stated"]);
    expect(buildRequestState("hi", INITIAL_HOME)).toEqual({ request: "hi", rooms: [...ROOMS], devices: ["lights", "thermostat", "blinds", "speaker", "tv", "front_door_lock"] });
    expect(EXAMPLE_REQUESTS).toHaveLength(20);
  });
});

describe("B4 dispatch", () => {
  const t = B4_THRESHOLDS;
  it("clarifies, chats, answers state questions and splits in that order", () => {
    expect(dispatch(answers({ category: { choice: "device_command", confidence: 0.49 } }), "x", t).kind).toBe("clarify");
    expect(dispatch(answers({ category: { choice: "other", confidence: 0.9 } }), "x", t).kind).toBe("clarify");
    expect(dispatch(answers({ category: { choice: "chit_chat" } }), "hi", t).kind).toBe("chat");
    expect(dispatch(answers({ category: { choice: "information_question" } }), "is it locked?", t).kind).toBe("state_question");
    expect(dispatch(answers({ is_question_about_state: 0.7 }), "is it on?", t).kind).toBe("state_question");
    expect(dispatch(answers({ is_compound: 0.7 }), "a and b", t).kind).toBe("split");
    expect(dispatch(answers({ is_compound: 0.69 }), "a", t).kind).toBe("commands");
  });
  it("asks for the device or room when they are missing or uncertain", () => {
    expect(dispatch(answers({ device: { choice: "lights", confidence: 0.59 } }), "x", t)).toMatchObject({ kind: "clarify", question_zh: "要控制哪个设备？" });
    expect(dispatch(answers({ device: { choice: "not_stated" } }), "x", t).kind).toBe("clarify");
    expect(dispatch(answers({ room: { choice: "not_stated" } }), "turn the tv off", t)).toMatchObject({ kind: "clarify", question_zh: "哪个房间？" });
    expect(dispatch(answers({ room: { choice: "bedroom", confidence: 0.49 } }), "x", t).kind).toBe("clarify");
    const all = dispatch(answers({ room: { choice: "whole_house" }, light_action: { choice: "turn_off" } }), "turn off all the lights", t);
    expect(all).toMatchObject({ kind: "commands", commands: [{ type: "lights", room: "all", on: false }] });
  });
  it("treats the door lock as high risk", () => {
    const lockAns = (choice: string, confidence: number) => answers({ device: { choice: "front_door_lock" }, room: { choice: "not_stated" }, lock_action: { choice, confidence } });
    expect(dispatch(lockAns("lock", 0.84), "lock the door", t)).toMatchObject({ kind: "confirm_lock", command: { type: "lock", locked: true }, confidence: 0.84 });
    expect(dispatch(lockAns("lock", 0.85), "lock the door", t)).toMatchObject({ kind: "commands", commands: [{ type: "lock", locked: true }] });
    expect(dispatch(lockAns("unlock", 0.99), "unlock the door", t)).toMatchObject({ kind: "confirm_lock", command: { type: "lock", locked: false } });
  });
  it("builds device commands, letting regex numbers override words and clarifying when a needed number is missing", () => {
    const pct = dispatch(answers({ room: { choice: "office" }, light_action: { choice: "change_brightness" }, brightness_level: { choice: "bright" } }), "dim the office lights to 30%", t);
    expect(pct).toMatchObject({ kind: "commands", commands: [{ type: "lights", room: "office", brightnessPercent: 30 }] });
    const words = dispatch(answers({ light_action: { choice: "change_brightness" }, brightness_level: { choice: "dim" } }), "dim the bedroom lights", t);
    expect(words).toMatchObject({ kind: "commands", commands: [{ type: "lights", room: "bedroom", brightness: "dim", brightnessPercent: 30 }] });
    expect(dispatch(answers({ light_action: { choice: "change_brightness" } }), "change the bedroom lights", t)).toMatchObject({ kind: "clarify" });
    expect(dispatch(answers({ light_action: { choice: "change_color" }, color: { choice: "blue" } }), "make it blue", t)).toMatchObject({ kind: "commands", commands: [{ type: "lights", room: "bedroom", color: "blue" }] });
    const temp = dispatch(answers({ device: { choice: "thermostat" }, thermostat_action: { choice: "set_specific" } }), "set the bedroom to 21 degrees", t);
    expect(temp).toMatchObject({ kind: "commands", commands: [{ type: "thermostat", room: "bedroom", targetC: 21 }] });
    expect(dispatch(answers({ device: { choice: "thermostat" }, thermostat_action: { choice: "set_specific" } }), "set the bedroom temperature", t)).toMatchObject({ kind: "clarify", question_zh: "设到几度？" });
    expect(dispatch(answers({ device: { choice: "thermostat" }, thermostat_action: { choice: "warmer" } }), "warmer", t)).toMatchObject({ kind: "commands", commands: [{ type: "thermostat", room: "bedroom", delta: 2 }] });
    expect(dispatch(answers({ device: { choice: "speaker" }, speaker_action: { choice: "set_volume" } }), "set the office volume to 4", t)).toMatchObject({ kind: "commands", commands: [{ type: "speaker", room: "bedroom", volume: 4 }] });
    expect(dispatch(answers({ device: { choice: "blinds" }, blinds_action: { choice: "open" } }), "open", t)).toMatchObject({ kind: "commands", commands: [{ type: "blinds", room: "bedroom", open: true }] });
    expect(dispatch(answers({ device: { choice: "tv" }, tv_action: { choice: "turn_off" } }), "tv off", t)).toMatchObject({ kind: "commands", commands: [{ type: "tv", room: "bedroom", on: false }] });
    expect(dispatch(answers({ light_action: { choice: "not_applicable" } }), "x", t)).toMatchObject({ kind: "clarify", question_zh: "对灯做什么？" });
  });
  it("records the speculative answers it ignored and the rule that fired", () => {
    const d = dispatch(answers({}), "turn on the bedroom lights", t);
    expect(d.trace.ignored).toEqual(expect.arrayContaining(["thermostat_action", "blinds_action", "speaker_action", "tv_action", "lock_action", "brightness_level", "color"]));
    expect(d.trace.ignored).not.toContain("light_action");
    expect(d.trace.rule_zh).toBe("light_action = turn_on");
  });
});
