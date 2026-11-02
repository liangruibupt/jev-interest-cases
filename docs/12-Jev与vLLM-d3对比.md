# 12 · Jev 与 vLLM d3（Decision 3.0）：全尺寸开源多模态族

**一句话**：[Decision 3.0](https://huggingface.co/collections/vllm-sr/decision-30)（简称 **d3**，vLLM Semantic Router 团队，2026-10 发布，Apache 2.0）是 Jev 的**开源多模态对位族**：同样的 System One 形态（state + Choice / Yes-No / Score → 每个选项一个校准概率，不生成文字），但一次给出**五个尺寸**——d3-lite 0.85B、d3-nano 2.21B、d3-mini 4.54B、d3-flash 8.39B、d3 26.09B——每一档都带视觉编码器，可读文本 / JSON / 图像。它自托管（`vllm-sr serve`，ROCm/CUDA），**没有官方托管 API**，加载需 `trust_remote_code=True`。团队自测榜领先，但数字多为内测。**本仓库暂不接它**（理由见下），这篇做有出处的对比，不是实测。

> 资料来源：vLLM Semantic Router 的 Decision 3.0 HF 合集与各档模型卡、Semantic Router GitHub 仓库，以及社区梳理（marktechpost，2026-10-11）。对比表里 d3 一侧的榜位（Jev Decision Index v0.3.1 文本 / 视觉板）**均为团队内测**；Jev 一侧按第三方引用。本仓库没有对 d3 做任何实测——它需要自托管 + `trust_remote_code`，详见"为什么本仓库暂不接它"。

## 对比

| 维度 | Jev（TypeSafe） | vLLM d3（Semantic Router） |
|---|---|---|
| 形态 | 闭源托管 API | **开放权重**，五档 0.85B–26.09B，自托管 |
| 许可与价格 | $0.042 / Mtok 输入，输出免费 | Apache 2.0，自托管 $0（只有算力成本）；**无官方托管 API** |
| 接口 | `POST /v1/systemone`，`@typesafe-ai/sdk` | 遵循 System One 形态（Choice / Yes-No / Score）；通过 `vllm-sr serve`（ROCm/CUDA）自建服务 |
| 原语 | Choice / Score / Noul | 同样三种：Choice、Yes/No（对应 Noul）、Score；一次调用回答全部问题 |
| 模型 | 未公开 | 五档各自微调自 Qwen：d3（26.09B）基于 Qwen3.8-27B，其余四档基于 Qwen3.5 的 0.8B / 2B / 4B / 9B 检查点；每档均带视觉编码器（0.10B–0.46B） |
| 上下文 | 每请求 64k；state + 最长问题 ≤ 32k | **未公开** |
| 选项数 | 最多 255 个选项仍可用 | 每个问题各走一次前向；文档未给选项硬上限 |
| 输入类型 | 文本（CJK 可用但较弱） | **文本 / JSON / 图像**（每档均带视觉编码器，多图各 ≤ 1.6 MP，每个问题看到全部图像）；不读音频 / 视频 |
| 延迟 | 官方约 100–150 ms；第三方 p50 236–276 ms；本仓库本地网络实测 0.35–0.8 s | 单张 AMD Instinct MI325X 自测：d3 文本 84 ms / 带图 342 ms；小档 d3-nano 21.7 ms、d3-lite 23.5 ms、d3-mini 28.5 ms、d3-flash 29.7 ms（纯文本中位） |
| 零样本准确率 | 微软表 82.3%；第三方 typed-decisions 0.727 | 团队内测：27B d3 文本板 **64.1**（领先 Perplexity Decider v1.1 的 62.8、Jev 的 60.1）、视觉板 71.6；9B d3-flash 文本 59.0，**超过上一代 Decision 2.0 的 27B（55.9）** |
| 校准 | RLCD，出厂即校准；ECE 0.144 / 0.246（第三方） | 未单列（同属 System One 校准目标；榜位含校准维度） |
| 权重 | 不开放 | **开放**（Apache 2.0，HF 五档全可下载）；BF16 safetensors，无官方量化变体 |
| 微调 | 不支持；用 state / instructions / criteria 适配 | 支持（权重开放，`transformers==5.17.0` + `trust_remote_code`）；可选 `flash-linear-attention` 加速线性注意力层 |
| 运行处 | TypeSafe API、Workers AI、OpenRouter | 自托管：`vllm-sr serve`（ROCm/CUDA）或 `transformers` AutoModel；无 GGUF/MLX |
| 适用边界 | jaggedness 清单（见 `03`） | 榜位均为团队内测、对着 live board 自评；小档不是每个板都领先（d3-lite 文本领先但视觉第 3，d3-nano 视觉领先但文本落后 LiquidAI d1-3B） |

### 五档一览（d3 的卖点是"全尺寸一条线铺"）

| 型号 | 参数 | 视觉编码器 | 文本板（内测） | 文本延迟（MI325X） | 定位 |
|---|---|---|---|---|---|
| d3-lite | 0.85B | 0.10B | 领先档内 | 23.5 ms | 边缘 / 守卫，最小占用 |
| d3-nano | 2.21B | 0.33B | 落后 d1-3B | 21.7 ms | 边缘路由 |
| d3-mini | 4.54B | 0.33B | 领先档内文本 + 视觉 | 28.5 ms | 小服务器通用 |
| d3-flash | 8.39B | 0.46B | 59.0（超上代 27B） | 29.7 ms | 性价比最佳档 |
| **d3** | 26.09B | 0.46B | **64.1**（榜首，内测） | 84 ms | 高精度判断 |

公开套件上，d3-flash（9B）对 Decision 2.0 的提升从 +8.0（27B）到 +15.1（0.8B）不等——**"小一档打上一代大一档"**是这一代最强的叙事。但要留意：d3 的 27B 文本内测 64.1，而 Torchcast Decision 27B 的公开套件分更高（65.1 vs 64.9），所以"榜首"要看是哪张板、谁测的。

### 怎么读这张表

- **d3 的卖点是尺寸谱系**：从 0.85B 到 26B，同一套原语、同一套训练方法贯穿，可按部署位置选档——边缘守卫用 d3-lite / nano，小服务器用 d3-mini，性价比用 d3-flash，高精度判断用 27B d3。这是本仓库这一组里**唯一自带完整小-中-大梯队**的开源族。
- **每档都带视觉**：和只有部分型号读图的其它族不同，d3 五档全部带视觉编码器，所以"要读图 + 要极小模型"这个组合只有 d3 能满足（d3-lite 0.85B 就能读图）。但它不读音频 / 视频——要音频 / 视频看 Clef-omni（doc 11）。
- **榜位要打折看**：d3 的领先数字基本是团队内测、对着 live board 自评，不是独立第三方榜。对比 Jev 的 60.11（Jev Decision Index 并列第二、第三方榜）时，口径不同，不能直接横比。
- **和 Strands / Laya 一边**：d3 和 doc 10 的 Strands Decider、doc 08 的 Laya 同属"开源自托管"阵营，与 Jev / 微软（托管）、Clef-omni（开源 + 托管）相对。d3 的差异化是**全尺寸 + 全档带视觉**。

## 对本仓库的意义：为什么本仓库暂不接它

1. **自托管门槛与"随手实测"不符**。d3 没有托管 API，必须自己 `vllm-sr serve`（ROCm/CUDA）或用 `transformers` AutoModel 起服务，加载还要 `trust_remote_code=True`。相比 doc 08 的 Laya（CPU / T4 一行起服务）或 doc 10 的 Strands（CLI 直接跑），d3 的起步重一些，不适合当"clone 下来随手跑"的第一块试验田。
2. **本仓库场景是纯文本，视觉用不上**。A1–C5 都是文本 / JSON 输入，d3 全档带视觉这一卖点在这里体现不出来；纯文本判断上还要跟 Jev 的零样本质量正面比，内测榜位不足以当依据。
3. **接口同形，复用路径现成**。真要接，Choice / Yes-No / Score 与本仓库一致，`scripts/laya-replay.ts` 可近乎原样复用（把 `LAYA_URL` 指向自托管的 d3 端点，Noul 走 yes/no 两选项 Choice 的还原路径与 doc 08 的 `LAYA_NOUL=choice` 一致）；费用卡按 $0 自托管计。
4. **小档适合未来的边缘场景**。如果以后要在本地 / 边缘加一个"超轻量路由 / 守卫"场景（B1 护栏那类），d3-lite（0.85B）或 d3-nano（2B）是值得评估的候选——那时再按 doc 08 文末的评估清单做留出集 + 校准，比现在空接更有意义。

**结论**：d3 适合"要开源、要从边缘到服务器一条线铺同一族决策模型、要每档都能读图"的团队。对本仓库这种纯文本、以离线回放为核心的学习材料，它暂不是合适的接入对象；真要用，优先评估 d3-flash（性价比）或 d3-lite（边缘），并为它新起一个带视觉或边缘约束的场景，而不是替换现有文本场景。

## 一句话选型

| 你的处境 | 选 |
|---|---|
| 要开源、从边缘到服务器一条线铺、每档都能读图 | **vLLM d3**（按档选 lite→27B） |
| 要极小模型 + 读图（0.85B 级别） | **d3-lite / d3-nano** |
| 开源性价比，9B 打上代 27B | **d3-flash** |
| 要成熟度、第三方榜位、最高校准，不绑云厂商 | **Jev** |
| 要音频 / 视频输入 | d3 不行——看 Clef-omni（doc 11） |
| 数据必须留在内网、要微调、零边际成本（更易起步） | Laya（doc 08）、Strands Decider（doc 10） |

## 资料

- HF 合集：[huggingface.co/collections/vllm-sr/decision-30](https://huggingface.co/collections/vllm-sr/decision-30)
- 旗舰模型卡：[huggingface.co/vllm-sr/d3](https://huggingface.co/vllm-sr/d3)（26.09B），[d3-flash](https://huggingface.co/vllm-sr/d3-flash)（8.39B）
- 其余档：[d3-lite](https://huggingface.co/vllm-sr/d3-lite)、[d3-nano](https://huggingface.co/vllm-sr/d3-nano)、[d3-mini](https://huggingface.co/vllm-sr/d3-mini)
- 底座：[Qwen/Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B)
- 代码 / 服务：[github.com/vllm-project/semantic-router](https://github.com/vllm-project/semantic-router)
- Demo：[HF Space d3-flash Studio](https://huggingface.co/spaces/vllm-sr/d3-flash)
- 社区梳理（非官方）：[What is Decision 3.0?（marktechpost，2026-10-11）](https://www.marktechpost.com/2026/10/11/what-is-decision-3-0-vllm-semantic-routers-new-open-decision-models/)
