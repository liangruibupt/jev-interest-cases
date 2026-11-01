# 10 · Jev 与 AWS Strands Decider 2B：更强的开源对位物

**一句话**：[Strands Decider 2B](https://github.com/strands-labs/strands-decider)（AWS Strands Labs，2026-10-01 发布，Apache 2.0）是 Jev 的**开源对位物，也是 Laya（doc 08）的更强替身**：同样的 System One 形态、同样自带**与 Jev 同形的 HTTP 服务**（`strands-decider serve` 暴露 `POST /v1/systemone`），但零样本质量明显高于 Laya——第三方 JevBench 上 **0.779（180 / 231）**，对比 Laya 基础检查点的 0.362。它底层是 **Qwen3.5-2B-Base（1.9B 参数）砍掉语言头、换上约百万参数的 pointer 头**，一次前向、不生成、不解码；RTX 3090 上单题中位 **115 ms**，也能在 Apple 芯片 Mac 或 CPU 上跑。它免费、可私有部署、可微调，代价是比 Jev / Microsoft-Decision-1 小一个数量级的模型带来的准确率差距（微软自己的 36 基准里它只测了 23 个、均分 54.8%，是小模型的硬伤）。**建议和 doc 08 一样从 B4 智能家居助手起步**，因为它和 Laya 共用 `/v1/systemone`，`scripts/laya-replay.ts` 的三个开关可以几乎原样复用。

> 资料来源：Strands Decider 官方 README 与 `evaluation/`、`docs/` 目录（strands-decider v1，`strands-decider-2B-qwen3.5-v1-2610`）、AWS / Strands Agents 发布博客（2026-10-01）、微软 Microsoft-Decision-1 发布表里的 Strands 行。对比表里 Strands 一侧的数字出自其自测的 JevBench 公开集（231 题），Jev 一侧沿用本仓库其他文档的口径。标明"本仓库实测"的除外——截至本文**本仓库尚未对 Strands Decider 做实测**，但它接口同形，复用 `laya-replay.ts` 的成本很低（见文末"接入计划"）。

## 对比

| 维度 | Jev（TypeSafe） | Strands Decider 2B（AWS Strands Labs） |
|---|---|---|
| 形态 | 闭源托管 API | 开放权重，`pip install strands-decider`，本地 / 自有 GPU / Mac / CPU / Docker |
| 许可与价格 | $0.042 / Mtok 输入，输出免费 | **Apache 2.0，自托管 $0**（只有算力成本） |
| 接口 | `POST /v1/systemone`，`@typesafe-ai/sdk` | `strands-decider serve` 暴露**同形**的 `POST /v1/systemone`；也有 CLI（`strands-decider ask …`）和 Strands Agents SDK 集成 |
| 原语 | Choice / Score / Noul | 同样三种，名字也一样（`noul` / `choice` / `score`），都从同一个 masked softmax 里读出来 |
| 模型 | 未公开 | **Qwen3.5-2B-Base（1.9B）+ rank-16 LoRA + fp32 pointer 头**；参考模型 `strands-decider-2B-qwen3.5-v1-2610`。另有 Gemma 4 家族（E2B / E4B / 12B / 26B-A4B）与早期 hobson-v19 / v21；权重同时在 HF 的 `StrandsAgents` 与 `amazon` 组织下 |
| 上下文 | 每请求 64k | **运行在 3,072–4,096 tokens 窗口**（远小于 Jev，但大于 Laya 英文版的 512） |
| 选项数 | 最多 255 个选项仍可用 | 架构上 pointer 头不含每选项参数，**不限选项数**、标签集由请求定义；实测准确率随基数下降 |
| 输入类型 | 文本 | 文本；Qwen3.5 base 原生多模态，`--vision` 可保留视觉塔读 base64 图像（已发布检查点未做图像训练，但 v19/v21 在 NaturalBench 上校准不错） |
| 延迟 | 官方约 100–150 ms；第三方 p50 236–276 ms；本仓库本地网络实测 0.35–0.8 s | **RTX 3090 单题中位 115 ms / p95 299 ms**；M3 Pro 温中位 153 ms；一次读 state、每多一题只加它自己的 token，所以多题几乎免费（无网络往返，自托管） |
| 零样本准确率 | typed-decisions 0.727（第三方） | **JevBench 公开集 0.779（180 / 231）**，分层 easy / standard / hard = 1.000 / 0.931 / 0.586；code 任务 0.836（微软 36 基准里只测了 23 个、均分 54.8%——大模型对比下的小模型差距） |
| 校准 | RLCD，出厂即校准；ECE 0.144 / 0.246（第三方） | **出厂即校准**：Brier 0.280、**ECE 0.072**；README 称短分类任务上 confidence ≥ 0.9 的答案约 95% 正确，低于此要确认或交人 |
| 语言 | 英文为主，CJK 可用但较弱 | 训练语料以英文公开数据集为主；中文单独结果未公布 |
| 微调 | 不支持；用 state / instructions / criteria 适配 | **支持且是卖点**：`training/recipe.sh all` 单机 1–8 卡，RTX 3090 约 11 小时 / 8×H100 约 1h10m；自带 `skills/customize-decider/` 技能引导"从你的决策到用自己数据评测 / 训练" |
| 第三方榜 | Jev Decision Index 60.11（并列第二） | **Decision Index 21.75（第 84）**——开源小模型的典型位置 |
| 已知短板 | jaggedness 清单（见 `03`） | 2B 小模型的绝对准确率天花板低；窗口只 3–4k；高基数选项与长文档偏弱；231 题基准样本少（重训标准差约 3.2 题，差距 < 10 题视为未分出胜负） |

### 怎么读这张表

- **Strands Decider 是"更能打的 Laya"**：和 Laya 一样开源、自托管、可微调、零边际成本、数据不出机器，但零样本质量高一大截（JevBench 0.779 vs Laya 0.362 基础检查点），窗口也更大（3–4k vs 512）。doc 08 里 Laya 零样本"离可用还差校准 / 微调"，Strands Decider 的出厂 ECE 0.072 与 easy 层 100% 让它**零样本就更接近可用**。
- **它和 Microsoft-Decision-1（doc 09）是两个方向**：微软是"同价同形的托管闭源"，Strands 是"开源自托管"。要 SLA 和省运维选微软 / Jev；要把权重和数据攥在自己手里、要微调、要离线选 Strands。
- **代价是绝对准确率**：2B 比 Jev（托管）/ Microsoft-Decision-1（9B）小一个数量级，微软那张表里 Strands 23 个基准只有 54.8%。它的定位是"快、便宜、可专门化的底座"，不是"开箱即用的最强判断引擎"。
- **三者共享同一套设计模式（`04`）**：场景代码里的问题、门限、组合逻辑都可以原样复用。

## 对本仓库的意义：和 Laya 一样只要换 URL（但要适配层）

Strands Decider 的 server 暴露与 Jev / Laya **逐字节同形**的 `POST /v1/systemone`（README 的 `curl` 示例请求体就是 `{"state":…, "questions":{…"type":"noul"…}}`，返回 `{"answers":…, "usage":…, "latency_ms":…}`）。所以 doc 08 对 Laya 的那套接入分析几乎原样成立：

```bash
# 本机起服务（RTX 3090 / Mac / CPU 均可）
pip install strands-decider
strands-decider serve StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 --port 8000

# 整个应用改问本地 decider
TYPESAFE_BASE_URL=http://127.0.0.1:8000 TYPESAFE_API_KEY=unused JEV_CACHE=off npm run dev
```

doc 08 列的四个坑同样要盯：

1. **必须 `JEV_CACHE=off`**：缓存键是 `state + questions + model`、不含 base URL，开缓存会悄悄返回 Jev 旧答案，或把 decider 的答案写进提交进仓库的 Jev 缓存。
2. **费用与模型名会说谎**：`jevCostUsd` 仍按 Jev 价计，但 Strands 自托管实为 $0——要在轨迹里加"后端"字段并把它记为 $0。
3. **对象 state 的处理待测**：Laya 实测忽略对象 state（`LAYA_STATE=text` 才救回来）。Strands 的 pointer 头架构不同，是否同样需要把 B4 的 `{request, rooms, devices}` 摊平成文本，要跑一次才知道。
4. **`confidence` 语义要核对**：Strands 的 CLI 直接给 `choice_0 -> billing (confidence 0.659)` 和每选项概率，`noul` 给 0–1 的单值；本仓库门限按 Jev 的 `confidence` 定，接入时要确认 Strands 的 `confidence` 是否同义，不同义就像 `LAYA_GATE=answer` 那样改用所选标签概率过门限。

## 为什么同样从 B4 开始

和 doc 08 完全同理，且 Strands 的公开证据更有利：

1. **结构最贴合**：B4 的 state 最长约 53 tokens、问题+选项最长约 80 tokens，远低于 Strands 的 3–4k 窗口；每个 Choice 最多 7 个短选项；没有 Score；79% 是 Choice。
2. **零样本起点更高**：Strands 出厂 easy 层 100%、standard 0.931，B4 本来就是把一个大意图问题拆成若干小 Choice，正落在它的强项上。
3. **开源优势在这里最值钱**：智能家居中控适合本地 / 离线、对延迟敏感、指令不出局域网、常开设备按次付费不划算——这些正是 Strands（和 Laya）对 Jev 的全部优势所在。
4. **出错代价有界**：B4 分派器本就有安全网（开锁永远要求确认、数字只来自正则、不确定就追问）。
5. **可量化**：20 条带预期分派结果的标注指令（`examples.ts`）+ 22 条 Jev 缓存答案作参照，复用回放脚本一次跑出对比。

## 接入计划（复用 `laya-replay.ts`）

`scripts/laya-replay.ts` 已经把"读缓存里某场景的 Jev 请求 → 原样发给 `LAYA_URL/v1/systemone` → 逐题比对 + 对 B4 跑真实 `dispatch()`"这条链写好了，而 Strands 的服务同形，所以最省力的路径是**把它参数化成任意 `/v1/systemone` 后端**而不是另写一个脚本：

| 步 | 做什么 | 通过标准 |
|---|---|---|
| 0 | 起服务：`pip install strands-decider && strands-decider serve StrandsAgents/strands-decider-2B-qwen3.5-v1-2610 --port 8000` | `curl localhost:8000/v1/systemone` 能返回答案 |
| 1 | 零样本回放：`LAYA_URL=http://127.0.0.1:8000 npx tsx scripts/laya-replay.ts b4`（脚本名可保留，或把 `LAYA_*` 泛化为 `DECIDER_*`） | 开锁从不直接执行；记下分派命中、各题一致率、实例内 p50 |
| 2 | 若对象 state 被无视，加 `LAYA_STATE=text` 重跑（和 Laya 同一开关） | 一致率明显回升 |
| 3 | 若 `confidence` 语义不同，加 `LAYA_GATE=answer` 按所选标签概率过门限 | 门限附近分派与 Jev 对齐 |
| 4 | 仍不达标时，用 `skills/customize-decider/` 技能 + `training/recipe.sh`，拿 Jev 当老师标注的数据做专门化微调 | 留出集分派命中不低于 Jev |
| 5 | 接进页面并给轨迹加"后端"字段、成本卡把 Strands 记为 $0 | 页面标明答案来自 Strands、费用显示 $0 |

与 Laya 的唯一结构差异：Strands 的默认模型名是 `strands-decider-2B-qwen3.5-v1-2610`（或 Gemma 4 家族），回放结果文件建议命名 `docs/results/strands-vs-jev-<场景>-<时间>.json` 以便和 Laya 的结果区分。

注意：与 Jev 一致不等于对。Jev 的答案只是参照；能当真值的只有 B4 的 20 条标注分派。

## 资料

- 仓库与模型：[github.com/strands-labs/strands-decider](https://github.com/strands-labs/strands-decider)，权重在 HF [`StrandsAgents`](https://huggingface.co/StrandsAgents) 与 [`amazon`](https://huggingface.co/amazon) 组织下
- 发布博客：[Introducing Strands Decider 2B（Strands Agents，2026-10-01）](https://strandsagents.com/blog/introducing-strands-decider/)
- 部署指南：仓库 `deploy/README.md`；[Deploying Strands Decider 2B on SageMaker AI](https://builder.aws.com/content/3KFnkGmzL3oHhDMFc2aicUDfXNm/deploying-strands-decider-b-on-sage-maker-ai)、[Serving Strands Decider on Amazon Bedrock AgentCore Runtime](https://builder.aws.com/content/3KNqrNkiEtf7wTUzTufirwAVL7O)
- 基准与校准：仓库 `evaluation/results.md`、`evaluation/jevbench.md`
- 架构：仓库 `docs/architecture.md`（pointer 头、训练目标）
- 第三方榜：[Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index)（Strands Decider 21.75）
- 媒体报道：[AWS Strands Labs Releases Strands Decider 2B（MarkTechPost）](https://www.marktechpost.com/2026/10/01/aws-strands-labs-releases-strands-decider-2b/)、[Strands Decider 2B: AWS's free decision model, tested（eesel）](https://www.eesel.ai/blog/strands-decider)
