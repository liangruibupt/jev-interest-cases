export type DispatchKind = "commands" | "confirm_lock" | "clarify" | "split" | "chat" | "state_question";

export interface ExampleRequest {
  text: string;
  note_zh: string;
  group: "single" | "compound" | "question" | "chat" | "confirm";
  /** Dispatch kinds we accept for this example (first = primary). */
  expect: DispatchKind[];
}

export const EXAMPLE_REQUESTS: ExampleRequest[] = [
  { text: "turn off all the lights", note_zh: "全屋灯：room = whole_house", group: "single", expect: ["commands"] },
  { text: "dim the office lights to 30%", note_zh: "百分比由正则提取，Jev 只判断\"有数字\"", group: "single", expect: ["commands"] },
  { text: "make the bedroom warmer", note_zh: "相对调节：+2°C", group: "single", expect: ["commands"] },
  { text: "set the bedroom to 21 degrees", note_zh: "具体温度来自正则", group: "single", expect: ["commands"] },
  { text: "turn the living room lights blue", note_zh: "颜色 Choice", group: "single", expect: ["commands"] },
  { text: "open the blinds in the kitchen", note_zh: "窗帘", group: "single", expect: ["commands"] },
  { text: "play some music in the bathroom", note_zh: "音箱播放", group: "single", expect: ["commands"] },
  { text: "set the office volume to 4", note_zh: "裸数字 → 音量", group: "single", expect: ["commands"] },
  { text: "turn the TV off", note_zh: "没说房间 → 追问", group: "single", expect: ["clarify"] },
  { text: "make it brighter", note_zh: "没说房间 → 追问（设备 Jev 反而很确定是灯 0.99）", group: "single", expect: ["clarify"] },
  { text: "lock the front door", note_zh: "高风险动作：置信度 ≥ 0.85 才直接执行", group: "confirm", expect: ["commands", "confirm_lock"] },
  { text: "unlock the front door", note_zh: "开锁永远要求确认", group: "confirm", expect: ["confirm_lock"] },
  { text: "turn off the kitchen lights and close the bedroom blinds", note_zh: "复合指令 → Claude 拆分 → 每段再问 Jev", group: "compound", expect: ["split"] },
  { text: "good morning! open the blinds and warm up the office", note_zh: "问候 + 两个动作", group: "compound", expect: ["split"] },
  { text: "turn everything off in the living room", note_zh: "一个房间多个设备：看 Jev 判为复合还是单一", group: "compound", expect: ["split", "commands", "clarify"] },
  { text: "make the bathroom lights warm white and dim", note_zh: "同一设备两个参数：拆或不拆都合理", group: "compound", expect: ["split", "commands"] },
  { text: "is the front door locked?", note_zh: "状态询问 → Claude 读房屋 JSON 回答", group: "question", expect: ["state_question"] },
  { text: "what temperature is the bedroom set to?", note_zh: "状态询问", group: "question", expect: ["state_question"] },
  { text: "thanks, that's all", note_zh: "闲聊 → Claude 一句回复", group: "chat", expect: ["chat"] },
  { text: "hi there", note_zh: "问候", group: "chat", expect: ["chat"] },
];
