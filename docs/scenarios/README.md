# 场景索引

新增：[C5 语义音乐盒](C5.md)，以语义判断驱动本地器乐创作、混音、变奏和 WAV 导出。

按学习路径排序。每个场景的详细说明（问题清单、组合逻辑、实测记录、成本对比）在实施该阶段时创建。

| # | 场景 | 类型 | 一句话 | 文档 |
|---|---|---|---|---|
| 1 | A1 原语实验室 | 纯 Jev | 实时看到 Choice / Score / Noul 的概率分布、延迟、费用 | [`A1.md`](A1.md) ✔ |
| 2 | A2 工单分流看板 | 纯 Jev | 10 题一次请求，置信度门控，阈值滑杆零推理重排 | [`A2.md`](A2.md) ✔ |
| 3 | A4 一致性与校准对比 | 纯 Jev（Claude 作对照） | Jev vs Claude 重复 15 轮：稳定性、延迟、成本 | [`A4.md`](A4.md) ✔ |
| 4 | B1 护栏 + 模型路由 | Jev + Claude | Jev 在 Claude 前分流：拦截、人工、Sonnet、Opus | [`B1.md`](B1.md) ✔ |
| 5 | B2 引用核验 | Jev + Claude | Claude 带引用作答，Jev 逐条核验 | [`B2.md`](B2.md) ✔ |
| 6 | A3 文档逐行语义搜索 | 纯 Jev | 218 行 Choice + 存在性 Noul，无 embedding | [`A3.md`](A3.md) ✔ |
| 7 | B3 RAG 段落守门人 | Jev + Claude | 四个 Noul 过滤证据与注入，Claude 只用被采纳的证据 | [`B3.md`](B3.md) ✔ |
| 8 | B4 智能家居助手 | Jev + Claude | 14 个 speculative 问题驱动虚拟房屋 | [`B4.md`](B4.md) ✔ |
| 9 | C1 作业按细则评分 | 行业判断 · Jev + Claude | 细则 Noul + 情境 Score；Claude 反馈由 Jev 核验 | [`C1.md`](C1.md) ✔ |
| 10 | C2 患者留言分诊 | 行业判断 · 纯 Jev | 紧急度 + 红旗 + 科室；数值由代码比较 | [`C2.md`](C2.md) ✔ |
| 11 | C3 公告重大性判断 | 行业判断 · 纯 Jev | 事件类型 + 重大性 Score，批量待阅列表 | [`C3.md`](C3.md) ✔ |
| 12 | C4 VPP 调度通知与告警 | 行业判断 · 纯 Jev | 通知 × 站点适用性；kW 与时间窗由代码解析 | [`C4.md`](C4.md) ✔ |

## P0 环境检查记录

运行 `npm run check-env` 后把表格贴在这里。

| 日期 | Jev | Sonnet 5 text/parse | Opus 5 text/parse | Sonnet 4.6 text/parse | 备注 |
|---|---|---|---|---|---|
| 2026-09-23 | ✔ jev-1.13.0，首次 3.1s，稳定 0.54–0.76s；218 选项 Choice ✔（11,971 tokens，684ms）；LLM 适配器 ✔（Σp=1.000） | ✔ 1.2–4.6s / ✔ `tool-lax` 3.1s | ✔ 1.5s / ✔ `tool-lax` 2.8s | ✔ 1.2s / ✔ `format` 1.2s | 见下方说明 |

### Bedrock runtime 上的结构化输出

- Sonnet 4.6：`output_config.format`（`messages.parse` + `zodOutputFormat`）直接可用。
- Sonnet 5 / Opus 5：`output_config.format` 返回 400 "Extra inputs are not permitted"；`strict: true` 的工具也被拒；**非 strict 的强制工具调用**（`tool_choice: {type:"tool"}`）可用，服务端用 zod 校验工具输入。
- `server/src/lib/claude.ts` 的 `claudeParse` 按 `format → tool → tool-lax` 自动回退并按模型记住可用模式；可用 `STRUCTURED_OUTPUT_MODE=format|tool|tool-lax` 强制。
- 首次调用 Sonnet 5 有约 4–5s 的冷启动，之后 1–2s。
- `output_config.effort: "low"` 在 Sonnet 4.6 / Sonnet 5 / Opus 5 上均可用。
- 完整探测：`npm run check-env` 共 9 项（Jev、218 选项 Choice、三层级 text+parse、LLM 适配器），任一失败退出码非 0。

### 本地网络下的 Jev 延迟（2026-09-23，`npm run latency`）

| 调用 | 延迟 | 说明 |
|---|---|---|
| 首次 | 1.2–3.1 s | 建连 + TLS（`curl` 测得 TCP 275ms、TLS 610ms）|
| 之后 6 次 | 540–760 ms | 连接复用后的稳定值 |

官方"约 100ms"是近区服务端延迟；从本地网络看，Jev 稳定在 0.5–0.8s，同网络下 Claude 文本调用为 1.2–5s。A4 场景会用同一网络同时测两者。
