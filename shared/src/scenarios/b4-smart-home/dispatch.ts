import type { Answers } from "../../types";
import { type Brightness, type Command, type DeviceId, type LightColor, type RoomTarget, DEVICES, ROOMS } from "./home";
import { extractNumber, type ExtractedNumber } from "./numbers";
import { B4_QUESTION_IDS } from "./questions";
import { B4_THRESHOLDS, type B4Thresholds } from "./thresholds";

export interface ChoiceRead {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface DispatchTrace {
  category?: ChoiceRead;
  compound: number;
  stateQuestion: number;
  mentionsNumber: number;
  room?: ChoiceRead;
  device?: ChoiceRead;
  action?: { id: string; read: ChoiceRead };
  number: ExtractedNumber | null;
  /** Speculative answers that were returned but not needed for this request. */
  ignored: string[];
  rule_zh: string;
}

export type Dispatch =
  | { kind: "commands"; commands: Command[]; trace: DispatchTrace }
  | { kind: "confirm_lock"; command: Extract<Command, { type: "lock" }>; confidence: number; trace: DispatchTrace }
  | { kind: "clarify"; question_zh: string; trace: DispatchTrace }
  | { kind: "split"; trace: DispatchTrace }
  | { kind: "chat"; trace: DispatchTrace }
  | { kind: "state_question"; trace: DispatchTrace };

const BRIGHTNESS_PERCENT: Record<Exclude<Brightness, "off">, number> = { dim: 30, medium: 60, bright: 100 };
const BRIGHTNESS_WORDS = ["dim", "medium", "bright"] as const;
const COLORS: readonly LightColor[] = ["white", "warm_white", "red", "blue", "green", "purple"];
const ACTION_QUESTION: Record<DeviceId, string> = {
  lights: "light_action",
  thermostat: "thermostat_action",
  blinds: "blinds_action",
  speaker: "speaker_action",
  tv: "tv_action",
  front_door_lock: "lock_action",
};
const DEVICE_ZH: Record<DeviceId, string> = { lights: "灯", thermostat: "温控", blinds: "窗帘", speaker: "音箱", tv: "电视", front_door_lock: "前门锁" };

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Turns the fourteen answers into commands, a clarification, a confirmation, or a hand-off to Claude. */
export function dispatch(answers: Answers, request: string, t: B4Thresholds = B4_THRESHOLDS): Dispatch {
  const used = new Set<string>();
  const choice = (id: string): ChoiceRead | undefined => {
    used.add(id);
    const a = answers[id];
    return a && a.type === "choice" ? { choice: a.choice, confidence: a.confidence ?? 0, probabilities: a.probabilities } : undefined;
  };
  const noul = (id: string): number => {
    used.add(id);
    const a = answers[id];
    return a && a.type === "noul" ? a.noul : 0;
  };

  const trace: DispatchTrace = {
    compound: noul("is_compound"),
    stateQuestion: noul("is_question_about_state"),
    mentionsNumber: noul("mentions_number"),
    number: extractNumber(request),
    ignored: [],
    rule_zh: "",
  };
  const finish = <D extends Dispatch>(d: D, rule: string): D => {
    trace.ignored = B4_QUESTION_IDS.filter((id) => !used.has(id) && answers[id] !== undefined);
    trace.rule_zh = rule;
    return d;
  };
  const clarify = (question_zh: string, rule: string) => finish({ kind: "clarify" as const, question_zh, trace }, rule);
  const commands = (cmds: Command[], rule: string) => finish({ kind: "commands" as const, commands: cmds, trace }, rule);

  const category = choice("category");
  trace.category = category;
  if (!category || category.confidence < t.categoryMin || category.choice === "other") return clarify("没听懂：是想控制设备、询问状态，还是聊天？", `category 置信度 ${(category?.confidence ?? 0).toFixed(2)} < ${t.categoryMin} 或为 other`);
  if (category.choice === "chit_chat") return finish({ kind: "chat", trace }, "category = chit_chat → Claude 一句回复");
  if (category.choice === "information_question" || trace.stateQuestion >= t.stateQuestion) return finish({ kind: "state_question", trace }, `状态询问（category=${category.choice}，is_question_about_state ${trace.stateQuestion.toFixed(2)}）→ Claude 读房屋状态回答`);
  if (trace.compound >= t.compound) return finish({ kind: "split", trace }, `is_compound ${trace.compound.toFixed(2)} ≥ ${t.compound} → Claude 拆分后逐条再问 Jev`);

  const device = choice("device");
  trace.device = device;
  if (!device || device.choice === "not_stated" || device.confidence < t.deviceMin || !(DEVICES as readonly string[]).includes(device.choice)) {
    return clarify("要控制哪个设备？", `device = ${device?.choice ?? "?"}（置信度 ${(device?.confidence ?? 0).toFixed(2)}，门限 ${t.deviceMin}）`);
  }
  const deviceId = device.choice as DeviceId;
  const actionId = ACTION_QUESTION[deviceId];
  const action = choice(actionId);
  if (!action || action.choice === "not_applicable" || action.confidence < t.actionMin) {
    return clarify(`对${DEVICE_ZH[deviceId]}做什么？`, `${actionId} = ${action?.choice ?? "?"}（置信度 ${(action?.confidence ?? 0).toFixed(2)}，门限 ${t.actionMin}）`);
  }
  trace.action = { id: actionId, read: action };
  const n = trace.number;

  // The door lock is house-level (no room) and high-risk.
  if (deviceId === "front_door_lock") {
    const command = { type: "lock" as const, locked: action.choice === "lock" };
    if (action.choice === "unlock") return finish({ kind: "confirm_lock", command, confidence: action.confidence, trace }, "开锁永远需要确认");
    if (action.confidence < t.lockMin) return finish({ kind: "confirm_lock", command, confidence: action.confidence, trace }, `lock 置信度 ${action.confidence.toFixed(2)} < ${t.lockMin} → 要求确认`);
    return commands([command], `lock 置信度 ${action.confidence.toFixed(2)} ≥ ${t.lockMin} → 直接上锁`);
  }

  const r = choice("room");
  trace.room = r;
  if (!r || r.choice === "not_stated" || r.confidence < t.roomMin) return clarify("哪个房间？", `room = ${r?.choice ?? "?"}（置信度 ${(r?.confidence ?? 0).toFixed(2)}，门限 ${t.roomMin}）`);
  let room: RoomTarget;
  if (r.choice === "whole_house") room = "all";
  else if ((ROOMS as readonly string[]).includes(r.choice)) room = r.choice as RoomTarget;
  else return clarify("哪个房间？", `room = ${r.choice} 不在房间列表中`);

  switch (deviceId) {
    case "lights": {
      if (action.choice === "turn_on") return commands([{ type: "lights", room, on: true }], "light_action = turn_on");
      if (action.choice === "turn_off") return commands([{ type: "lights", room, on: false }], "light_action = turn_off");
      if (action.choice === "change_color") {
        const c = choice("color");
        if (!c || c.confidence < t.actionMin || !COLORS.includes(c.choice as LightColor)) return clarify("换成什么颜色？", `color = ${c?.choice ?? "?"}`);
        return commands([{ type: "lights", room, color: c.choice as LightColor }], `light_action = change_color，color = ${c.choice}`);
      }
      // change_brightness: any number in the text is read as a percentage; otherwise the level in words.
      if (n && n.unit !== "celsius") {
        const pct = clamp(Math.round(n.value), 0, 100);
        return commands([{ type: "lights", room, brightnessPercent: pct }], `light_action = change_brightness，正则取到 ${n.value}${n.unit === "percent" ? "%" : ""} → ${pct}%`);
      }
      const level = choice("brightness_level");
      if (!level || level.confidence < t.actionMin || !(BRIGHTNESS_WORDS as readonly string[]).includes(level.choice)) return clarify("调到多亮？（暗 / 中 / 亮，或一个百分比）", `brightness_level = ${level?.choice ?? "?"}，且没有百分比`);
      const b = level.choice as Exclude<Brightness, "off">;
      return commands([{ type: "lights", room, brightness: b, brightnessPercent: BRIGHTNESS_PERCENT[b] }], `light_action = change_brightness，brightness_level = ${b}`);
    }
    case "thermostat": {
      if (action.choice === "warmer") return commands([{ type: "thermostat", room, delta: 2 }], "thermostat_action = warmer → +2°C");
      if (action.choice === "cooler") return commands([{ type: "thermostat", room, delta: -2 }], "thermostat_action = cooler → −2°C");
      if (!n || n.unit === "percent") return clarify("设到几度？", "thermostat_action = set_specific 但正则没取到温度");
      return commands([{ type: "thermostat", room, targetC: n.value }], `thermostat_action = set_specific，正则取到 ${n.value}°C`);
    }
    case "blinds":
      return commands([{ type: "blinds", room, open: action.choice === "open" }], `blinds_action = ${action.choice}`);
    case "speaker": {
      if (action.choice === "play") return commands([{ type: "speaker", room, playing: true }], "speaker_action = play");
      if (action.choice === "pause_or_stop") return commands([{ type: "speaker", room, playing: false }], "speaker_action = pause_or_stop");
      if (action.choice === "volume_up") return commands([{ type: "speaker", room, volumeDelta: 2 }], "speaker_action = volume_up → +2");
      if (action.choice === "volume_down") return commands([{ type: "speaker", room, volumeDelta: -2 }], "speaker_action = volume_down → −2");
      if (!n || n.unit === "celsius") return clarify("音量调到几？（0–10）", "speaker_action = set_volume 但正则没取到数字");
      const volume = clamp(Math.round(n.unit === "percent" ? n.value / 10 : n.value), 0, 10);
      return commands([{ type: "speaker", room, volume }], `speaker_action = set_volume，正则取到 ${n.value}${n.unit === "percent" ? "%" : ""} → ${volume}`);
    }
    case "tv":
      return commands([{ type: "tv", room, on: action.choice === "turn_on" }], `tv_action = ${action.choice}`);
  }
}
