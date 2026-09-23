export const ROOMS = ["living_room", "kitchen", "bedroom", "bathroom", "office"] as const;
export type RoomId = (typeof ROOMS)[number];
export const DEVICES = ["lights", "thermostat", "blinds", "speaker", "tv", "front_door_lock"] as const;
export type DeviceId = (typeof DEVICES)[number];

export type Brightness = "off" | "dim" | "medium" | "bright";
export type LightColor = "white" | "warm_white" | "red" | "blue" | "green" | "purple";

export interface RoomState {
  lights: { on: boolean; brightness: Brightness; color: LightColor };
  thermostat: { targetC: number };
  blinds: { open: boolean };
  speaker: { playing: boolean; volume: number };
  tv: { on: boolean };
}

export interface HomeState {
  rooms: Record<RoomId, RoomState>;
  front_door_lock: { locked: boolean };
}

const room = (p: Partial<RoomState> = {}): RoomState => ({
  lights: { on: false, brightness: "off", color: "warm_white" },
  thermostat: { targetC: 20 },
  blinds: { open: true },
  speaker: { playing: false, volume: 3 },
  tv: { on: false },
  ...p,
});

export const INITIAL_HOME: HomeState = {
  rooms: {
    living_room: room({ lights: { on: true, brightness: "medium", color: "warm_white" }, thermostat: { targetC: 21 }, tv: { on: true } }),
    kitchen: room({ lights: { on: true, brightness: "bright", color: "white" }, thermostat: { targetC: 20 } }),
    bedroom: room({ lights: { on: false, brightness: "off", color: "warm_white" }, thermostat: { targetC: 19 }, blinds: { open: false } }),
    bathroom: room({ thermostat: { targetC: 22 } }),
    office: room({ lights: { on: true, brightness: "medium", color: "white" }, thermostat: { targetC: 22 }, speaker: { playing: true, volume: 4 } }),
  },
  front_door_lock: { locked: false },
};

export type RoomTarget = RoomId | "all";

export type Command =
  | { type: "lights"; room: RoomTarget; on?: boolean; brightness?: Brightness; brightnessPercent?: number; color?: LightColor }
  | { type: "thermostat"; room: RoomTarget; targetC?: number; delta?: number }
  | { type: "blinds"; room: RoomTarget; open: boolean }
  | { type: "speaker"; room: RoomTarget; playing?: boolean; volume?: number; volumeDelta?: number }
  | { type: "tv"; room: RoomTarget; on: boolean }
  | { type: "lock"; locked: boolean };

export const ROOM_LABELS_ZH: Record<RoomTarget, string> = { living_room: "客厅", kitchen: "厨房", bedroom: "卧室", bathroom: "浴室", office: "书房", all: "全屋" };
export const DEVICE_LABELS_ZH: Record<DeviceId, string> = { lights: "灯", thermostat: "温控", blinds: "窗帘", speaker: "音箱", tv: "电视", front_door_lock: "前门锁" };
export const BRIGHTNESS_LABELS_ZH: Record<Brightness, string> = { off: "关", dim: "暗", medium: "中", bright: "亮" };
export const COLOR_LABELS_ZH: Record<LightColor, string> = { white: "白", warm_white: "暖白", red: "红", blue: "蓝", green: "绿", purple: "紫" };

export function percentToBrightness(p: number): Brightness {
  if (p <= 0) return "off";
  if (p <= 35) return "dim";
  if (p <= 70) return "medium";
  return "bright";
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const targets = (r: RoomTarget): RoomId[] => (r === "all" ? [...ROOMS] : [r]);

/** Pure reducer: returns a new HomeState with the command applied. */
export function applyCommand(home: HomeState, cmd: Command): HomeState {
  if (cmd.type === "lock") return { ...home, front_door_lock: { locked: cmd.locked } };
  const rooms = { ...home.rooms };
  for (const id of targets(cmd.room)) {
    const r = rooms[id];
    switch (cmd.type) {
      case "lights": {
        let { on, brightness, color } = r.lights;
        if (cmd.color !== undefined) {
          color = cmd.color;
          on = true;
          if (brightness === "off") brightness = "medium";
        }
        if (cmd.brightnessPercent !== undefined) {
          brightness = percentToBrightness(cmd.brightnessPercent);
          on = brightness !== "off";
        } else if (cmd.brightness !== undefined) {
          brightness = cmd.brightness;
          on = brightness !== "off";
        }
        if (cmd.on !== undefined) {
          on = cmd.on;
          if (on && brightness === "off") brightness = "medium";
          if (!on) brightness = "off";
        }
        rooms[id] = { ...r, lights: { on, brightness, color } };
        break;
      }
      case "thermostat": {
        const base = cmd.targetC ?? r.thermostat.targetC + (cmd.delta ?? 0);
        rooms[id] = { ...r, thermostat: { targetC: clamp(Math.round(base * 2) / 2, 10, 30) } };
        break;
      }
      case "blinds":
        rooms[id] = { ...r, blinds: { open: cmd.open } };
        break;
      case "speaker": {
        const volume = clamp(cmd.volume ?? r.speaker.volume + (cmd.volumeDelta ?? 0), 0, 10);
        const playing = cmd.playing ?? (cmd.volume !== undefined || cmd.volumeDelta !== undefined ? true : r.speaker.playing);
        rooms[id] = { ...r, speaker: { playing, volume } };
        break;
      }
      case "tv":
        rooms[id] = { ...r, tv: { on: cmd.on } };
        break;
    }
  }
  return { ...home, rooms };
}

/** One Chinese log line per command. */
export function describeCommand(cmd: Command): string {
  if (cmd.type === "lock") return `前门 → ${cmd.locked ? "上锁" : "开锁"}`;
  const where = ROOM_LABELS_ZH[cmd.room];
  switch (cmd.type) {
    case "lights": {
      const parts: string[] = [];
      if (cmd.on === true) parts.push("打开");
      if (cmd.on === false) parts.push("关闭");
      if (cmd.brightnessPercent !== undefined) parts.push(`亮度 ${cmd.brightnessPercent}%（${BRIGHTNESS_LABELS_ZH[percentToBrightness(cmd.brightnessPercent)]}）`);
      else if (cmd.brightness !== undefined) parts.push(`亮度 ${BRIGHTNESS_LABELS_ZH[cmd.brightness]}`);
      if (cmd.color !== undefined) parts.push(`颜色 ${COLOR_LABELS_ZH[cmd.color]}`);
      return `${where}灯 → ${parts.join("，") || "不变"}`;
    }
    case "thermostat":
      return `${where}温控 → ${cmd.targetC !== undefined ? `${cmd.targetC}°C` : `${(cmd.delta ?? 0) > 0 ? "+" : ""}${cmd.delta ?? 0}°C`}`;
    case "blinds":
      return `${where}窗帘 → ${cmd.open ? "打开" : "关闭"}`;
    case "speaker": {
      const parts: string[] = [];
      if (cmd.playing === true) parts.push("播放");
      if (cmd.playing === false) parts.push("暂停");
      if (cmd.volume !== undefined) parts.push(`音量 ${cmd.volume}`);
      if (cmd.volumeDelta !== undefined) parts.push(`音量 ${cmd.volumeDelta > 0 ? "+" : ""}${cmd.volumeDelta}`);
      return `${where}音箱 → ${parts.join("，") || "不变"}`;
    }
    case "tv":
      return `${where}电视 → ${cmd.on ? "开" : "关"}`;
  }
}
