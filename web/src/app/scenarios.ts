export type ScenarioStatus = "planned" | "available";

export interface ScenarioMeta {
  id: "a1" | "a2" | "a3" | "a4" | "b1" | "b2" | "b3" | "b4" | "c1" | "c2" | "c3" | "c4" | "c5";
  path: string;
  title: string;
  subtitle: string;
  proves: string;
  group: "pure" | "hybrid" | "industry";
  status: ScenarioStatus;
}

/** Sidebar order = recommended learning path. */
export const SCENARIOS: ScenarioMeta[] = [
  { id: "a1", path: "/a1", title: "A1 原语实验室", subtitle: "Choice / Score / Noul 实时可视化", proves: "三种原语的返回形状；~100ms 可嵌入 UI", group: "pure", status: "available" },
  { id: "a2", path: "/a2", title: "A2 工单分流看板", subtitle: "一次请求 10 题，阈值滑杆零推理重排", proves: "speculative fan-out 与置信度路由", group: "pure", status: "available" },
  { id: "a4", path: "/a4", title: "A4 一致性与校准对比", subtitle: "Jev vs Claude 重复 15 轮", proves: "稳定性、延迟、成本的实测数字", group: "pure", status: "available" },
  { id: "b1", path: "/b1", title: "B1 护栏 + 模型路由", subtitle: "Jev 在 Claude 前分流", proves: "1% 成本的前置分类器", group: "hybrid", status: "available" },
  { id: "b2", path: "/b2", title: "B2 引用核验", subtitle: "Claude 写，Jev 查", proves: "通用验证", group: "hybrid", status: "available" },
  { id: "a3", path: "/a3", title: "A3 文档逐行语义搜索", subtitle: "218 行 Choice + 存在性 Noul", proves: "无 embedding 的检索与 Choice 的陷阱", group: "pure", status: "available" },
  { id: "b3", path: "/b3", title: "B3 RAG 段落守门人", subtitle: "四个 Noul 过滤证据与注入", proves: "上下文选择与安全护栏", group: "hybrid", status: "available" },
  { id: "b4", path: "/b4", title: "B4 智能家居助手", subtitle: "14 个 speculative 问题驱动 UI", proves: "带概率的 function calling", group: "hybrid", status: "available" },
  { id: "c1", path: "/c1", title: "C1 作业按细则评分", subtitle: "教育：细则 Noul + 情境 Score，低置信度交老师", proves: "行业判断：评分是文字判断，句数与算术留给代码", group: "industry", status: "available" },
  { id: "c2", path: "/c2", title: "C2 患者留言分诊", subtitle: "医疗：紧急度 + 红旗 + 科室，数值由代码比较", proves: "行业判断：分诊可以，诊断不行", group: "industry", status: "available" },
  { id: "c3", path: "/c3", title: "C3 公告重大性判断", subtitle: "金融：事件类型 + 重大性 Score，批量成待阅列表", proves: "行业判断：判断文字，不判断价格", group: "industry", status: "available" },
  { id: "c4", path: "/c4", title: "C4 VPP 调度通知与告警", subtitle: "能源：通知是否适用于本站点、告警属于哪类", proves: "行业判断：文本适用性交 Jev，kW 与时间窗交代码", group: "industry", status: "available" },
  { id: "c5", path: "/c5", title: "C5 语义音乐盒", subtitle: "把画面感变成可播放的器乐", proves: "语义判断驱动确定性创作；本地混音与 WAV 导出", group: "pure", status: "available" },
];
