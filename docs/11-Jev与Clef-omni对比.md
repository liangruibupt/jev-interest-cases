# 11 · Jev 与 Cloudflare Clef-omni：开源权重 + 托管 + 多模态（含音频 / 视频）

**一句话**：[Clef-omni](https://huggingface.co/Cloudflare/clef-omni)（Cloudflare，2026-10-09 发布）是 Clef 决策模型族里的**多模态成员**，也是本仓库关注的几款里**唯一**既开放权重（Apache 2.0、可从 HF 下载自托管）、又在 Workers AI 托管、且**一次调用就能读文本 / 图像 / 音频 / 视频**的 System One 模型。它遵循与 Jev 同形的 `noul` / `choice` / `score` 原语，底层是 Cloudflare 在 **Qwen3-Omni-30B-A3B-Instruct** 上后训练（30B 总参 / 3B 激活的 MoE，LoRA 适配）。它在意图分类类任务上领先，但在硬推理 / 工作流上明显弱于纯文本的 Clef——**多模态是它的卖点，不是判断质量的升级**。**本仓库暂不接它**（理由见下），这篇做有出处的对比，不是实测。

> 资料来源：Cloudflare 的 clef-omni Workers AI 模型页与开发者文档、"faster, cheaper, multimodal" 发布博客（2026-10-09）、HF 模型卡，以及社区梳理（marktechpost，2026-10-11）。对比表里 Jev 一侧的数字按各家自测或第三方引用，口径不一。本仓库没有对 Clef-omni 做任何实测——多模态输入（音频 / 视频）本仓库场景也用不上，详见"为什么本仓库暂不接它"。

## 对比

| 维度 | Jev（TypeSafe） | Clef-omni（Cloudflare） |
|---|---|---|
| 形态 | 闭源托管 API | **开放权重 + 托管**：Apache 2.0 权重可从 HF 下载，同时在 Workers AI 以 `@cf/cloudflare/clef-omni` 托管 |
| 许可与价格 | $0.042 / Mtok 输入，输出免费 | Apache 2.0；Workers AI **$0.15 / Mtok** 输入、输出免费（约 Jev 的 3.6×）；自托管只有算力成本 |
| 接口 | `POST /v1/systemone`，`@typesafe-ai/sdk` | 遵循 TypeSafe 的 Jev / SystemOne API 形态（`noul` / `choice` / `score`）；Workers AI 走 `@cf/cloudflare/clef-omni` |
| 原语 | Choice / Score / Noul | 同样三种：`noul`（真 / 假）、`choice`、`score` |
| 模型 | 未公开 | Qwen3-Omni-30B-A3B-Instruct 后训练：**30B 总参、3B 激活（MoE）**，冻结 Qwen3 主干、训练 LoRA 适配，去掉 TTS 输出路径 |
| 上下文 | 每请求 64k；state + 最长问题 ≤ 32k | 托管 **64,000 tokens** |
| 选项数 | 最多 255 个选项仍可用 | 每请求 1–64 个问题；文档未给选项硬上限 |
| 输入类型 | 文本（CJK 可用但较弱） | **文本 / 图像 / 音频 / 视频**，单次调用联合处理：图像 ≤ 4（PNG/JPEG/WebP，64–1,024 tokens 每张）、音频 ≤ 4 段（WAV/MP3，各 ≤ 300s，约 780 tokens/分钟）、视频 ≤ 2 段（MP4/WebM，各 ≤ 60s，2 fps 采样） |
| 延迟 | 官方约 100–150 ms；第三方 p50 236–276 ms；本仓库本地网络实测 0.35–0.8 s | 自测：文本约 **130 ms**、图像约 **150 ms**；21s 带声视频约 **1.5 s**（均为 Cloudflare 自测中位） |
| 零样本准确率 | 微软表 82.3%；第三方 typed-decisions 0.727 | **意图分类领先**：Banking77 94.8 / CLINC150+OOS 97.7 macro-F1（族内第一）、Amazon ESCI 57.8；但推理 / 工作流弱于纯文本 Clef（GPQA Diamond 47.4 vs Jev 78.3，When2Call 63.3 vs Jev 81.0），家电 case-exact 69.3 vs Clef-flash 97.7 |
| 校准 | RLCD，出厂即校准；ECE 0.144 / 0.246（第三方） | 训练用 label-smoothing 交叉熵 + Brier 分校准；未单列 ECE |
| 权重 | 不开放 | **开放**（Apache 2.0，HF 可下载）；自托管单张 H200≈64 GB 显存（bfloat16），社区另有 MLX 4-bit（约 20 GB，Apple Silicon）等量化分支 |
| 微调 | 不支持；用 state / instructions / criteria 适配 | 支持（权重开放）；Cloudflare 另有 RL 微调平台 |
| 运行处 | TypeSafe API、Workers AI、OpenRouter | Workers AI（`@cf/cloudflare/clef-omni`）；或下载权重自托管 |
| 适用边界 | jaggedness 清单（见 `03`） | 多模态是强项，但硬推理 / 工作流评测普遍落后纯文本 Clef；音乐 / 音频细粒度任务很弱（POP909-CL accuracy 2.6） |

### Clef 家族一览（为什么升级到 Clef-omni）

初版 Clef 与 Clef-flash 在 2026-10-01 发布，Clef-omni 在 8 天后（10-09）跟上，同一次更新还把 Clef-flash 降价、把托管 Clef 迁到 SGLang 提速：

| 型号 | 参数 | 输入 | 托管价格 | 上下文 | 定位 |
|---|---|---|---|---|---|
| **Clef-omni** | 30B 总 / 3B 激活（MoE） | 文本 / 图像 / **音频** / 视频 | $0.15 / Mtok | 64k | 多模态，一次调用读四种模态 |
| Clef | 27B dense | 文本 / 图像 / 视频帧 | $0.24 / Mtok | 64k | 纯文本 / 视觉，推理 / 工作流最强 |
| Clef-flash | 9B dense | 文本 / 图像 / 视频帧 | **$0.038 / Mtok**（已低于 Jev） | 托管 24k / 自托管 256k | 便宜快，文本路由首选 |

迁到 SGLang 后托管 Clef 的中位延迟从 262 ms 降到 152 ms（约 800 tokens，1.7×），3,400 tokens 从 616 ms 降到 305 ms（2.0×）——**无新权重，纯服务栈优化**。

### 怎么读这张表

- **Clef-omni 的独特卖点是模态广度**：它是本仓库这一组里唯一原生读**音频**的决策模型（Clef / Clef-flash 只到图像 / 视频帧，Microsoft-Decision-1 纯文本，Laya / Strands / d3 不读音频）。一次调用把视频帧与音频同步进一个序列联合判断，省掉多模态管线里常见的转写 / 字幕步骤。
- **但多模态 ≠ 判断更强**：Clef-omni 在 Cloudflare 自己的评测里，工作流 5 项全部低于纯文本 Clef，硬推理（GPQA）也明显落后 Jev。要的是广度（读图 / 读音 / 读视频）就上 Clef-omni；要的是纯文本的最高判断质量，纯文本 Clef 或 Jev 更合适。
- **价格 / 性价比的阶梯在家族内部**：纯文本便宜路由走 9B Clef-flash（$0.038，已低于 Jev $0.042）；要图像 / 视频推理走 27B Clef；要音频或四模态一次读完走 Clef-omni（$0.15）。
- **开放权重是它和微软的根本差别**：和 Microsoft-Decision-1（doc 09）一样是"可托管"，但 Clef-omni 的 Apache 2.0 权重可下载、可自托管、可微调——这点它和 Laya / Strands / d3 一边，而不是和微软一边。

## 对本仓库的意义：为什么本仓库暂不接它

doc 08 接 Laya 只要一个环境变量，是因为 Laya 开放权重能本机起服务、随手实测。Clef-omni 的情况介于 Laya 与 Microsoft-Decision-1 之间：

1. **本仓库场景都是纯文本，用不到它的卖点**。A1–C5 十一个场景的 state 都是文本 / JSON，没有任何图像 / 音频 / 视频输入。Clef-omni 最值钱的地方（四模态一次读完）在这里完全体现不出来；纯文本判断上它还弱于 Clef 与 Jev，接进来只会更贵更慢。
2. **托管按量计费，破坏"clone 下来就能跑"**。走 Workers AI 要 Cloudflare 账号、按 token 付费（$0.15/Mtok），和 Microsoft-Decision-1 一样会打破本仓库"靠提交进仓库的 Jev 缓存、无 key 也能离线回放"的约定。
3. **自托管门槛不低**。要体现开放权重的价值得自己起服务，单张 H200≈64 GB 显存（或量化到 MLX 4-bit 约 20 GB）——比 Laya 的 CPU / T4 起步重得多，不适合当"随手实测"的学习材料。
4. **接口同形，复用路径现成**。真要接，`noul` / `choice` / `score` 与本仓库一致，`scripts/laya-replay.ts` 可近乎原样复用（把 `LAYA_URL` 指向自托管的 Clef-omni 端点）；费用卡要像 doc 08 第 5 步那样加"后端"字段并按 $0.15/Mtok 计。

**结论**：Clef-omni 适合"要在一次决策里同时读文本 + 图像 + 音频 + 视频"的多模态管线（客服语音 + 截图分诊、短视频内容审核、含音频的工单）。对本仓库这种纯文本、以离线回放为核心的学习材料，它不是合适的接入对象——真要用它的多模态能力，应另起一个带多模态输入的新场景，而不是替换现有文本场景。

## 一句话选型

| 你的处境 | 选 |
|---|---|
| 一次决策要读图像 / **音频** / 视频 + 文本 | **Clef-omni**（Workers AI 或自托管） |
| 要图像 / 视频推理、纯文本最高判断质量、开放权重 | **Clef**（27B dense，$0.24） |
| 纯文本、要最便宜且已低于 Jev | **Clef-flash**（9B，$0.038） |
| 要成熟度、第三方榜位、最高校准，不绑云厂商 | **Jev** |
| 数据必须留在内网、要微调、零边际成本 | 开源几款——Laya（doc 08）、Strands Decider（doc 10）、vLLM d3（doc 12） |

## 资料

- 模型卡：[huggingface.co/Cloudflare/clef-omni](https://huggingface.co/Cloudflare/clef-omni)
- Workers AI 模型页 / 文档：[developers.cloudflare.com/workers-ai/models/clef-omni](https://developers.cloudflare.com/workers-ai/models/clef-omni)
- 发布博客：[Clef: faster, cheaper, multimodal（Cloudflare，2026-10-09）](https://blog.cloudflare.com/clef-faster-cheaper-multimodal/)、[初版发布](https://blog.cloudflare.com/clef-decision-models/)
- 底座：[Qwen/Qwen3-Omni-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct)
- 量化分支：[mlx-community/clef-omni-4bit](https://huggingface.co/mlx-community/clef-omni-4bit)（Apple Silicon）
- 社区梳理（非官方）：[Meet Cloudflare Clef-omni（marktechpost，2026-10-11）](https://www.marktechpost.com/2026/10/11/cloudflare-clef-omni-multimodal-decision-model/)
