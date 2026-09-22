# 场景索引

按学习路径排序。每个场景的详细说明（问题清单、组合逻辑、实测记录、成本对比）在实施该阶段时创建。

| # | 场景 | 类型 | 一句话 | 文档 |
|---|---|---|---|---|
| 1 | A1 原语实验室 | 纯 Jev | 实时看到 Choice / Score / Noul 的概率分布、延迟、费用 | `A1.md`（P1） |
| 2 | A2 工单分流看板 | 纯 Jev | 10 题一次请求，置信度门控，阈值滑杆零推理重排 | `A2.md`（P2） |
| 3 | A4 一致性与校准对比 | 纯 Jev（Claude 作对照） | Jev vs Claude 重复 15 轮：稳定性、延迟、成本 | `A4.md`（P3） |
| 4 | B1 护栏 + 模型路由 | Jev + Claude | Jev 在 Claude 前分流：拦截、人工、Sonnet、Opus | `B1.md`（P4） |
| 5 | B2 引用核验 | Jev + Claude | Claude 带引用作答，Jev 逐条核验 | `B2.md`（P5） |
| 6 | A3 文档逐行语义搜索 | 纯 Jev | 218 行 Choice + 存在性 Noul，无 embedding | `A3.md`（P6） |
| 7 | B3 RAG 段落守门人 | Jev + Claude | 四个 Noul 过滤证据与注入，Claude 只用被采纳的证据 | `B3.md`（P7） |
| 8 | B4 智能家居助手 | Jev + Claude | 14 个 speculative 问题驱动虚拟房屋 | `B4.md`（P8） |

## P0 环境检查记录

运行 `npm run check-env` 后把表格贴在这里。

| 日期 | Jev | Sonnet 5 text/parse | Opus 5 text/parse | Sonnet 4.6 text/parse | 备注 |
|---|---|---|---|---|---|
| | | | | | |
