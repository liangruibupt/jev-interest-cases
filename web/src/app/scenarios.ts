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
  { id: "a1", path: "/a1", title: "A1 原语实验室", subtitle: "Choice / Score / Noul 实时可视化", proves: "三种原语的返回形状；~100ms 可嵌入 UI", group: "pure", status: "available" },
  { id: "a2", path: "/a2", title: "A2 工单分流看板", subtitle: "一次请求 10 题，阈值滑杆零推理重排", proves: "speculative fan-out 与置信度路由", group: "pure", status: "available" },
  { id: "a4", path: "/a4", title: "A4 一致性与校准对比", subtitle: "Jev vs Claude 重复 15 轮", proves: "稳定性、延迟、成本的实测数字", group: "pure", status: "planned" },
  { id: "b1", path: "/b1", title: "B1 护栏 + 模型路由", subtitle: "Jev 在 Claude 前分流", proves: "1% 成本的前置分类器", group: "hybrid", status: "planned" },
  { id: "b2", path: "/b2", title: "B2 引用核验", subtitle: "Claude 写，Jev 查", proves: "通用验证", group: "hybrid", status: "planned" },
  { id: "a3", path: "/a3", title: "A3 文档逐行语义搜索", subtitle: "218 行 Choice + 存在性 Noul", proves: "无 embedding 的检索与 Choice 的陷阱", group: "pure", status: "planned" },
  { id: "b3", path: "/b3", title: "B3 RAG 段落守门人", subtitle: "四个 Noul 过滤证据与注入", proves: "上下文选择与安全护栏", group: "hybrid", status: "planned" },
  { id: "b4", path: "/b4", title: "B4 智能家居助手", subtitle: "14 个 speculative 问题驱动 UI", proves: "带概率的 function calling", group: "hybrid", status: "planned" },
];
