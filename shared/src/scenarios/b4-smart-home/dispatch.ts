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
const ACTION_QUESTION: Record<DeviceId, string> = {
  lights: "light_action",
  thermostat: "thermostat_action",
  blinds: "blinds_action",
  speaker: "speaker_action",
  tv: "tv_action",
  front_door_lock: "lock_action",
};

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

  let room: RoomTarget | undefined;
  if (deviceId !== "front_door_lock") {
    const r = choice("room");
    trace.room = r;
    if (!r || r.choice === "not_stated" || r.confidence < t.roomMin) return clarify("哪个房间？", `room = ${r?.choice ?? "?"}（置信度 ${(r?.confidence ?? 0).toFixed(2)}，门限 ${t.roomMin}）`);
    if (r.choice === "whole_house") room = "all";
    else if ((ROOMS as readonly string[]).includes(r.choice)) room = r.choice as RoomTarget;
    else return clarify("哪个房间？", `room = ${r.choice} 不在房间列表中`);
  }

  const actionId = ACTION_QUESTION[deviceId];
  const action = choice(actionId);
  if (!action || action.choice === "not_applicable" || action.confidence < t.actionMin) {
    return clarify(`对${deviceLabel(deviceId)}做什么？`, `${actionId} = ${action?.choice ?? "?"}（置信度 ${(action?.confidence ?? 0).toFixed(2)}，门限 ${t.actionMin}）`);
  }
  trace.action = { id: actionId, read: action };
  const n = trace.number;

  switch (deviceId) {
    case "front_door_lock": {
      const command = { type: "lock" as const, locked: action.choice === "lock" };
      if (action.choice === "unlock") return finish({ kind: "confirm_lock", command, confidence: action.confidence, trace }, "开锁永远需要确认");
      if (action.confidence < t.lockMin) return finish({ kind: "confirm_lock", command, confidence: action.confidence, trace }, `lock 置信度 ${action.confidence.toFixed(2)} < ${t.lockMin} → 要求确认`);
      return finish({ kind: "commands", commands: [command], trace }, `lock 置信度 ${action.confidence.toFixed(2)} ≥ ${t.lockMin} → 直接上锁`);
    }
    case "lights": {
      const r = room!;
      if (action.choice === "turn_on") return finish({ kind: "commands", commands: [{ type: "lights", room: r, on: true }], trace }, "light_action = turn_on");
      if (action.choice === "turn_off") return finish({ kind: "commands", commands: [{ type: "lights", room: r, on: false }], trace }, "light_action = turn_off");
      if (action.choice === "change_color") {
        const c = choice("color");
        if (!c || c.choice === "not_stated" || c.confidence < t.actionMin) return clarify("换成什么颜色？", `color = ${c?.choice ?? "?"}`);
        return finish({ kind: "commands", commands: [{ type: "lights", room: r, color: c.choice as LightColor }], trace }, `light_action = change_color，color = ${c.choice}`);
      }
      // change_brightness: a percentage from the regex wins; otherwise the level in words.
      if (n && n.unit === "percent") return finish({ kind: "commands", commands: [{ type: "lights", room: r, brightnessPercent: n.value }], trace }, `light_action = change_brightness，正则取到 ${n.value}%`);
      const level = choice("brightness_level");
      if (!level || level.choice === "not_stated" || level.confidence < t.actionMin) return clarify("调到多亮？（暗 / 中 / 亮，或一个百分比）", `brightness_level = ${level?.choice ?? "?"}，且没有百分比`);
      const b = level.choice as Exclude<Brightness, "off">;
      return finish({ kind: "commands", commands: [{ type: "lights", room: r, brightness: b, brightnessPercent: BRIGHTNESS_PERCENT[b] }], trace }, `light_action = change_brightness，brightness_level = ${b}`);
    }
    case "thermostat": {
      const r = room!;
      if (action.choice === "warmer") return finish({ kind: "commands", commands: [{ type: "thermostat", room: r, delta: 2 }], trace }, "thermostat_action = warmer → +2°C");
      if (action.choice === "cooler") return finish({ kind: "commands", commands: [{ type: "thermostat", room: r, delta: -2 }], trace }, "thermostat_action = cooler → −2°C");
      if (!n || (n.unit !== "celsius" && n.unit !== "bare")) return clarify("设到几度？", "thermostat_action = set_specific 但正则没取到温度");
      return finish({ kind: "commands", commands: [{ type: "thermostat", room: r, targetC: n.value }], trace }, `thermostat_action = set_specific，正则取到 ${n.value}°C`);
    }
    case "blinds":
      return finish({ kind: "commands", commands: [{ type: "blinds", room: room!, open: action.choice === "open" }], trace }, `blinds_action = ${action.choice}`);
    case "speaker": {
      const r = room!;
      if (action.choice === "play") return finish({ kind: "commands", commands: [{ type: "speaker", room: r, playing: true }], trace }, "speaker_action = play");
      if (action.choice === "pause_or_stop") return finish({ kind: "commands", commands: [{ type: "speaker", room: r, playing: false }], trace }, "speaker_action = pause_or_stop");
      if (action.choice === "volume_up") return finish({ kind: "commands", commands: [{ type: "speaker", room: r, volumeDelta: 2 }], trace }, "speaker_action = volume_up → +2");
      if (action.choice === "volume_down") return finish({ kind: "commands", commands: [{ type: "speaker", room: r, volumeDelta: -2 }], trace }, "speaker_action = volume_down → −2");
      if (!n) return clarify("音量调到几？（0–10）", "speaker_action = set_volume 但正则没取到数字");
      return finish({ kind: "commands", commands: [{ type: "speaker", room: r, volume: n.unit === "percent" ? Math.round(n.value / 10) : n.value }], trace }, `speaker_action = set_volume，正则取到 ${n.value}`);
    }
    case "tv":
      return finish({ kind: "commands", commands: [{ type: "tv", room: room!, on: action.choice === "turn_on" }], trace }, `tv_action = ${action.choice}`);
  }
}

function deviceLabel(d: DeviceId): string {
  return { lights: "灯", thermostat: "温控", blinds: "窗帘", speaker: "音箱", tv: "电视", front_door_lock: "前门锁" }[d];
}
