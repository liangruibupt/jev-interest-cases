# Jev Lab · 学习 TypeSafe Jev 的 8 个可视化场景

**Jev** 是 TypeSafe 公司的 System One 模型：它读懂自然语言，但不生成文字，只回答你定义好的类型化问题（Choice / Score / Noul），约 100 毫秒返回校准过的概率与置信度，输入 $0.042/Mtok、输出免费。代码掌控流程，Jev 只在需要"常识判断"的节点给出一个可阈值化、可排序、可组合的数字。

本仓库是一套学习材料 + 可运行的 Web 应用：8 个场景按学习路径排列，每个场景都展示**发给 Jev 的原始问题、返回的概率、延迟与费用**，以及"如果用 LLM 做同样的事"的成本基线；其中 4 个场景把 Jev 与 Claude（经 AWS Bedrock）组合使用。

## 快速开始

```bash
npm install
cp .env.example .env          # 填入 TYPESAFE_API_KEY（https://console.typesafe.ai/keys）
                              # Claude 走 AWS Bedrock：AWS_PROFILE / AWS_REGION 已有默认值
npm run check-env             # 探测 Jev 与 Bedrock 各层级，打印延迟与费用
npm run dev                   # 后端 http://localhost:8787 + 前端 http://localhost:5173
npm run smoke -- p0           # 用真实 API 跑一次三原语示例
npm test                      # vitest（shared + server）
```

可选：安装 TypeSafe 的 Claude Code 技能，让编码助手熟悉 Jev 的 API 与模式：

```bash
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
```

## 学习路径

| # | 场景 | 证明了什么 | 成本下降（预估 → 实测） |
|---|---|---|---|
| 1 | **A1 原语实验室** ✔ | 三种原语的返回形状；~100ms 可嵌入 UI；字面理解与数数陷阱 | 判断步骤 ≈99% |
| 2 | **A2 工单分流看板** ✔ | speculative fan-out、置信度路由、"判断即数据"（改阈值零推理） | ≈99%，重排额外省 100% |
| 3 | **A4 一致性与校准对比** ✔ | 用自己的数据复现 Jev vs Claude 的稳定性 / 延迟 / 成本 | 实测：Jev 比 Claude 快 9–17×、便宜 200–635× |
| 4 | **B1 护栏 + 模型路由** ✔ | Jev 作为 Claude 前面 1% 成本的分流器与护栏 | 分类步骤 ≈99%（实测 90×）；端到端实测 87% |
| 5 | **B2 引用核验** ✔ | 生成者与检验者分离，用 LLM 千分之几的成本核查引用 | 核验步骤实测 66×（98.5%）；端到端 ≈29% |
| 6 | **A3 文档逐行语义搜索** ✔ | 无 embedding 的检索；Choice 概率和为 1 必须配存在性 Noul | 检索步骤实测 50×（98.0%）；相对向量检索不省钱，优势是零索引与"文档未涉及"判定 |
| 7 | **B3 RAG 段落守门人** ✔ | 证据筛选与提示注入检测；让 LLM 敢于反驳错误前提 | 守门步骤实测 73×（98.6%）；端到端另省生成阶段输入 tokens |
| 8 | **B4 智能家居助手** ✔ | 带概率的 function calling；数字留给正则；高风险动作更高门限 | 纯指令实测 68×（98.5%）；20 条混合流量 ≈ 85% |

成本估算方法与完整实测表见 `docs/05-成本模型.md`：判断步骤实测 50–635×，含生成的端到端 29–87%。

## 截图

`docs/screenshots/`：`home.png` 总览 · `a1-quickstart.png` / `a1-counting.png` · `a2-board.png` / `a2-sliders.png` · `a4-heatmap.png` · `b1-router.png` · `b2-citations.png` · `a3-find.png` / `a3-absent.png` · `b3-gatekeeper.png` / `b3-ungated.png` / `b3-false-premise.png` · `b4-home.png`。

## 文档

- `docs/00-什么是Jev.md` · `01-三种原语.md` · `02-置信度与阈值.md` · `03-与LLM的差异与局限.md` · `04-设计模式.md` · `05-成本模型.md`
- `docs/scenarios/` 每个场景的问题清单、组合逻辑、实测记录
- `docs/superpowers/specs/2026-09-22-jev-lab-design.md` 设计稿；`docs/superpowers/plans/` 实施计划

## 目录

```
shared/   问题、阈值、权重、成本模型、数据集 —— 唯一的"可审阅处"，前后端共用
server/   Hono API；唯一持有密钥的进程；封装 Jev（缓存/限流/计费）与 Claude（Bedrock runtime）
web/      Vite + React 前端：场景页面、请求检视器、费用仪表、成本对比卡
scripts/  check-env（环境探测）、smoke（真实 API 冒烟）、vendor-datasets（下载公开数据集）
docs/     中文教学文档与设计/计划
```

## 约定

- 演示数据为英文（Jev 英文准确率最高），界面与文档为中文。
- Claude 经 AWS Bedrock runtime 调用，模型层级与价格集中在 `shared/src/pricing.ts`（Sonnet 5 / Opus 5 为主，Sonnet 4.6 / Opus 4.6 作对照，Fable 5.1 可选）。
- `server/.cache/jev/` 中的 Jev 响应缓存会提交到仓库，新 clone 无 key 也能回放演示；A4 实验永远绕过缓存。
- 数据集：GitHub 服务条款（CC0 1.0）、RFC 7519（IETF Trust，保留版权声明），其余为合成数据。
