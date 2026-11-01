# 09 · Jev 与 Microsoft-Decision-1：同价同形的托管对位物

**一句话**：[Microsoft-Decision-1](https://ai.azure.com/catalog/models/Microsoft-Decision-1)（微软，2026-10-09 发布）是 Jev 的**托管闭源对位物**：同样的 System One 形态（state + 一组定好答案的类型化问题 → 每个选项一个校准概率，不生成文字），同样 `$0.042 / Mtok` 输入、输出免费的定价，连 OpenRouter 上的原语名（`noul` / `choice` / `score`）和示例请求都和 Jev 一模一样。它底层是微软在 Alibaba 开放权重 **Qwen3.5-9B** 上后训练出来的，走 Microsoft Foundry（"Direct from Azure"）或 OpenRouter 的 Decisions API。它和 Jev 真正的区别**不在判断质量**——微软自己的基准里两者互有胜负——**而在是谁在卖**：Azure 的采购、计费与 SLA。**本仓库不接它**（理由见下），这篇只做有出处的对比，不是实测。

> 资料来源：微软 Foundry 模型卡、微软 Command Line 发布博客（2026-10-09）、OpenRouter 模型页，以及社区梳理（eesel 的 Microsoft-Decision-1 解析，2026-10-10）。对比表里 Jev 一侧的基准数字是**微软公布的**，其中第三方延迟引用 JevBench v1.6.1 的调整中位数。标明"微软自测"的除外。本仓库没有对 Microsoft-Decision-1 做任何实测——它闭源、要 Azure / OpenRouter 账号，也没有可下载的权重，详见"为什么本仓库不接它"。

## 对比

| 维度 | Jev（TypeSafe） | Microsoft-Decision-1（微软） |
|---|---|---|
| 形态 | 闭源托管 API | 闭源托管 API（Direct from Azure） |
| 许可与价格 | $0.042 / Mtok 输入，输出免费 | **同价**：$0.042 / Mtok 输入，输出免费（发布博客与 OpenRouter 标价；Azure 价目表当时还没有这一行） |
| 接口 | `POST /v1/systemone`，`@typesafe-ai/sdk` | OpenRouter：`POST https://openrouter.ai/api/alpha/decisions`，model id `microsoft/microsoft-decision-1`；Foundry 的请求格式发布时**尚未公开文档**。两条路都明确"chat completions SDK 不适用" |
| 原语 | Choice / Score / Noul | 同样三种，名字也一样（`noul` / `choice` / `score`）；另有 rubric 评分、groundedness、安全标记、显式弃答（"cannot tell"） |
| 模型 | 未公开 | Qwen3.5-9B 后训练；微软说之后会换基座到 MAI 与 OpenAI 模型 |
| 上下文 | 每请求 64k；state + 最长问题 ≤ 32k | **32,768 tokens**（单次读入 state + 全部问题） |
| 选项数 | 最多 255 个选项仍可用 | 文档未给硬上限；支持 yes/no、多选、评分、分类、rubric |
| 输入类型 | 文本（CJK 可用但较弱） | **纯文本**，不接图像 / 音频 / 视频（Clef、OpenAI Decisions API 接图像，它不接） |
| 延迟 | 官方约 100–150 ms；第三方 p50 236–276 ms；本仓库本地网络实测 0.35–0.8 s | **微软自测 85 ms p50 / 125 ms p95**（Foundry 同区域紧贴模型测）；**OpenRouter 外部实测 p50 0.19 s（最优 provider）/ 0.27 s（平均）/ p99 0.67 s**。两个数字不是同一场比赛 |
| 零样本准确率 | 微软表里 82.3% | 微软表里 **83.5%**（36 个基准、147,137 道盲测题的平均）。社区第三方榜（Jev Decision Index v0.3.1）**尚未收录** |
| 校准 | 微软表里 **93.7**（100 为满分） | 微软表里 **92.2**，比 Jev 低 1.5 分——若你要按置信度门限自动执行，这比那 1.2% 的准确率领先更要紧 |
| 权重 | 不开放 | **不开放**；Hugging Face 仓库 404，不能自托管、不能微调 |
| 微调 | 不支持；用 state / instructions / criteria 适配 | 不支持（无权重）；微软说会"持续更新权重，接口形态不变"——意味着你上个月调好的门限可能被悄悄挪动 |
| 运行处 | TypeSafe API、Workers AI、OpenRouter | Microsoft Foundry、OpenRouter（背后只有 Azure 一个 provider） |
| 适用边界 | jaggedness 清单（见 `03`） | 模型卡明确：不写文字、不解释理由；不得作为信贷 / 就业 / 住房 / 保险 / 教育 / 医疗 / 法律等**后果性决定的唯一依据** |

### 微软自己的基准表（节选）

微软发布博客领先的那张 36 基准、147,137 道盲测题的表，核心几行：

| 模型 | 平均准确率 | 中位延迟 | 校准（100 为满分） |
|---|---|---|---|
| **Microsoft-Decision-1** | `83.5%` | 85 ms p50、125 ms p95 | 92.2 |
| Jev 1.13.0 | 82.3% | 240 ms | `93.7` |
| Quyet-1.0-Large | 81.9% | 380 ms | 93.1 |
| GPT-6 Luna Decisions | 79.4% | 300 ms | 89.9 |
| H2O-Lightning-4B v1.1 | 77.2% | 210 ms | 91.8 |
| Strands-Decider 2B（36 个里测了 23 个） | 54.8% | 未测 | 未评 |

读之前先读脚注：竞品延迟来自 JevBench v1.6.1 的调整中位数（2026-10-07 核对），而 Microsoft-Decision-1 的 85 ms 是"在 Foundry 同区域紧贴模型测的"——**不是同一场比赛**。微软还报告：平均 1.3% 的扰动会让答案翻转，选项改写 / 反转 / 打乱时零翻转；安全测试覆盖 11 个基准、5,250 条请求。发布时 Jev 一开始**不在表里**，社区点赞最高的追问是"Jev 怎么没排进来？那才是大家要拿来对比的 #1"，微软随后补了 Jev 的准确率与校准行。

### 怎么读这张表

- **Microsoft-Decision-1 的优势不是判断质量，是分发渠道**：和 Jev 同价、同形、答案同量级（一位 HN 用户的小套件实测"比 Jev 便宜 0.72 倍、延迟略高 283 vs 369 ms p50，各场景结果非常接近"）。真正的差别是它**由 Azure 卖**——Azure 账单、Azure SLA、不必新过一轮供应商评审。已经在买 Azure 的团队，这是最熟的采购路径。
- **Jev 的优势是成熟度与校准**：发布即有第三方榜位（Jev Decision Index 上 60.11，并列第二；Microsoft-Decision-1 还未收录），OpenRouter 决策榜上 Jev 1.13 是 999M 请求量级，Microsoft-Decision-1 还在前十开外。校准上 Jev 也高 1.5 分。
- **两者共享同一套设计模式（`04`）**：speculative fan-out、置信度路由、"判断即数据"、代码先行。场景代码里的问题、门限、组合逻辑都可以原样复用。
- **不是纯换 base URL**：OpenAI 的 Decisions API 把 yes/no 叫 `predicate`，而 Microsoft-Decision-1 和 Jev 一样叫 `noul`，所以 Jev↔微软比 Jev↔OpenAI 更接近换 URL；但 Foundry 请求格式发布时还没公开文档（一位 day-one 用户在 HN 抱怨"部署了也不知道该 POST 什么"），OpenRouter 那条路才有成文的 Decisions API。

## 对本仓库的意义：为什么本仓库不接它

doc 08 里接 Laya 只要一个环境变量，是因为 Laya 开放权重、能在本机起 `laya-serve`，实测随手可做。Microsoft-Decision-1 不一样：

1. **没有权重，接入要花钱走云**。要么开 Azure 订阅从 Foundry 部署，要么拿 OpenRouter key 调 Decisions API——两条路都按 token 计费、都把请求送到微软的基础设施上。本仓库的其余场景靠 `server/.cache/jev/` 里提交进仓库的缓存**无 key 也能回放**；换成一个必须联网付费的闭源 API，等于把"clone 下来就能跑"这条约定破坏掉。
2. **闭源意味着没有"实测"能加进来**。doc 08 的价值一半在 `scripts/laya-replay.ts` 跑出的真数字（一致率、分派命中、实例内 p50）。Microsoft-Decision-1 既不能看权重也不能本地起服务，最多只能像本篇这样做有出处的对比——这正是它和 Laya / Strands Decider（doc 10）的根本差别。
3. **接口接近但仍需适配层**。若真要在 `/b4` 之类页面上试，OpenRouter 的 `noul` / `choice` / `score` 和本仓库一致，但：Foundry 请求格式未公开；费用卡仍按 Jev 价计（要像 doc 08 第 5 步那样加"后端"字段，不过微软恰好同价，所以成本数字反而不会说谎）；微软"持续更新权重"会让门限漂移，接入后要定期复核 `confidence` 门限。

**结论**：Microsoft-Decision-1 适合"已经在 Azure 上、想要一个有 SLA 的托管决策模型"的团队；它不适合本仓库这种"零成本、可离线回放、以实测为核心"的学习材料。真要评估它，照 doc 08 文末那份社区评估清单做：冻结 schema 与门限、建覆盖各类样本的留出集、按类报 F1 / 校准 / 覆盖率与弃答率、测 p50/p95 延迟与冷启动、把总成本算全、先影子运行再开有后果的动作。

## 一句话选型

| 你的处境 | 选 |
|---|---|
| 已在 Azure 上采购，要托管 + SLA + 统一账单 | **Microsoft-Decision-1**（Foundry Direct from Azure） |
| 要成熟度、第三方榜位、最高校准，不绑云厂商 | **Jev** |
| 要图像 / 视频输入 | 都不行——看 Cloudflare Clef 或 OpenAI Decisions API |
| 数据必须留在内网、要能微调、零边际成本 | 都不行（都闭源）——看 Laya（doc 08）或 Strands Decider（doc 10） |
| 要每个决定附带理由 | 都不给理由——自己记录输入 / 选项 / 概率，低置信度交人或交 LLM |

## 资料

- 模型卡：[ai.azure.com/catalog/models/Microsoft-Decision-1](https://ai.azure.com/catalog/models/Microsoft-Decision-1)
- 微软发布博客：[Our model for fast decision-making（Command Line）](https://commandline.microsoft.com/microsoft-decision-1-model-foundry/)、[Foundry 博客](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-microsoft-decision-1-in-microsoft-foundry-for-decision-and-classific/4562742)
- Foundry 文档：[Deploy and use Microsoft-Decision-1](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision)
- OpenRouter 模型页：[openrouter.ai/microsoft/microsoft-decision-1](https://openrouter.ai/microsoft/microsoft-decision-1)
- 社区梳理（非官方）：[Microsoft-Decision-1 explained: how it works, access and limits（eesel，2026-10-10）](https://www.eesel.ai/blog/microsoft-decision-1)
- 第三方榜：[Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index)（截至 v0.3.1 尚未收录 Microsoft-Decision-1）
- 学术对比：[Benchmarking System One decision models against trained classifiers and language models（arXiv 2610.00346）](https://arxiv.org/html/2610.00346v1)
