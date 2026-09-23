/** Synthetic VPP sites and notices for C4. Fictional operators; hand-labelled acceptable routes per site for smoke checks. */
export type C4Route = "act_now" | "schedule" | "info" | "acknowledge_test" | "alarm" | "not_applicable" | "review";

export interface VppSite {
  id: string;
  name: string;
  region: string;
  asset_type: "battery_storage" | "solar_plus_storage" | "demand_response_load";
  capacity_kw: number;
  note_zh: string;
}

export interface VppNotice {
  id: string;
  from: "grid_operator" | "aggregator" | "telemetry" | "customer";
  text: string;
  /** Acceptable routes per site id (first = primary). */
  expected: Record<string, C4Route[]>;
  note_zh: string;
}

export const VPP_SITES: VppSite[] = [
  { id: "S1", name: "Harbor Point BESS", region: "North Zone", asset_type: "battery_storage", capacity_kw: 2000, note_zh: "北区 2 MW 电池储能" },
  { id: "S2", name: "Sunfield Solar+Storage", region: "South Zone", asset_type: "solar_plus_storage", capacity_kw: 800, note_zh: "南区 800 kW 光储" },
  { id: "S3", name: "Riverside Commercial DR", region: "North Zone", asset_type: "demand_response_load", capacity_kw: 350, note_zh: "北区 350 kW 商业需求响应负荷" },
];

export const VPP_NOTICES: VppNotice[] = [
  { id: "N01", from: "grid_operator", text: "Demand response event called for North Zone tomorrow, September 24, from 16:00 to 19:00. All enrolled demand response loads must curtail to their committed levels for the full event window. Confirm participation by 12:00 tomorrow.",
    expected: { S1: ["not_applicable", "review", "act_now"], S2: ["not_applicable"], S3: ["act_now", "schedule"] }, note_zh: "北区需求响应事件：DR 负荷必须行动；电池是否算\"enrolled demand response load\"取决于注册——Jev 按字面把北区电池也当作可参与资源（applies_asset ≈ 0.87），标注接受两种结果" },
  { id: "N02", from: "grid_operator", text: "Test event: frequency response resources of at least 1 MW in all zones will receive a test dispatch signal at 14:00 today. This is a test only; no actual response is required and no settlement will occur.",
    expected: { S1: ["acknowledge_test"], S2: ["not_applicable"], S3: ["not_applicable"] }, note_zh: "测试事件，≥ 1 MW 由代码比较：2 MW 适用、800 kW 不适用" },
  { id: "N03", from: "grid_operator", text: "Due to transmission maintenance, all solar generation in South Zone must curtail output to 50% of nameplate between 11:00 and 15:00 on September 24. Battery discharge is not affected.",
    expected: { S1: ["not_applicable"], S2: ["schedule", "act_now"], S3: ["not_applicable"] }, note_zh: "南区光伏限出力 50%：只对南区光伏" },
  { id: "N04", from: "grid_operator", text: "Market notice: real-time prices in North Zone are expected to exceed $300/MWh between 17:00 and 20:00 this evening. This is informational; no dispatch instruction is issued at this time.",
    expected: { S1: ["info"], S2: ["not_applicable"], S3: ["info"] }, note_zh: "价格信息：北区适用但无需行动" },
  { id: "N05", from: "telemetry", text: "ALARM: state-of-charge sensor reading has been stale for 15 minutes on inverter 3 at Harbor Point BESS. Last valid reading 09:27. Dispatch capability may be affected.",
    expected: { S1: ["alarm"], S2: ["not_applicable"], S3: ["not_applicable"] }, note_zh: "遥测告警，点名站点 S1" },
  { id: "N06", from: "telemetry", text: "ALARM: heartbeat lost from the Riverside Commercial gateway; last message received at 09:42. Site telemetry is offline.",
    expected: { S1: ["not_applicable"], S2: ["not_applicable"], S3: ["alarm"] }, note_zh: "通信告警，点名 Riverside（S3）" },
  { id: "N07", from: "aggregator", text: "August settlement statements are now available in the participant portal for all resources. Please review and raise any disputes within 10 business days.",
    expected: { S1: ["info", "schedule"], S2: ["info", "schedule"], S3: ["info", "schedule"] }, note_zh: "结算通知：全体适用，低紧急" },
  { id: "N08", from: "grid_operator", text: "SAFETY: the fire department reports smoke near the Sunfield substation. All solar inverters at Sunfield Solar+Storage must be de-energized immediately and remain offline pending inspection.",
    expected: { S1: ["not_applicable"], S2: ["alarm", "act_now"], S3: ["not_applicable"] }, note_zh: "安全告警，点名 S2，立即行动" },
  { id: "N09", from: "grid_operator", text: "Dispatch instruction: battery storage resources in North Zone discharge at 100% of committed capacity from 17:00 to 18:30 today. Acknowledge within 15 minutes.",
    expected: { S1: ["act_now"], S2: ["not_applicable"], S3: ["not_applicable"] }, note_zh: "北区电池放电指令：只对 S1" },
  { id: "N10", from: "customer", text: "Hi, this is the facilities manager at Riverside Commercial. We cannot participate in this week's demand response events because of an electrical audit on site. Please exclude us until next Monday.",
    expected: { S3: ["act_now", "schedule"], S1: ["not_applicable"], S2: ["not_applicable"] }, note_zh: "客户退出请求，点名 S3" },
  { id: "N11", from: "aggregator", text: "Scheduled maintenance of the aggregator portal on Saturday from 02:00 to 04:00. Telemetry and dispatch are not affected; the portal will be unavailable during the window.",
    expected: { S1: ["info"], S2: ["info"], S3: ["info"] }, note_zh: "门户维护：全体适用，仅告知" },
  { id: "N12", from: "aggregator", text: "Reminder: demand response loads that have not re-registered for the winter program by October 1 will be dropped from the program. Battery and solar resources are enrolled automatically and need not act.",
    expected: { S1: ["not_applicable", "info"], S2: ["not_applicable", "info"], S3: ["schedule", "act_now"] }, note_zh: "重新注册提醒：DR 负荷需行动；电池 / 光伏明确无需" },
];
