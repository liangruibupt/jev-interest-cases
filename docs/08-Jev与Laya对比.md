# 08 · Jev 与 Laya：对比与第一个落地场景

**一句话**：[Laya](https://huggingface.co/convaiinnovations/laya)（Convai Innovations，Apache 2.0）是 Jev 的开源对位物：同样的 System One 形态（state + Choice / Score / Noul → 校准概率，不生成文字）、同样的 RLCD 训练思路，而且自带一个**与 Jev 同形的 HTTP 服务**（`POST /v1/systemone`）。它更快、免费、可私有部署、可微调；代价是零样本准确率明显低于 Jev、上下文与选项预算小、出厂概率过度自信。**建议从 B4 智能家居助手开始**。

**实测（2026-10-08，B4，g4dn.xlarge / T4）**：原样把 Jev 请求发给 Laya，分派只命中 **3 / 20**（Jev 20 / 20）；把 state 改成纯文本、Noul 改成两选项 Choice、按 `answer_confidence` 过门限后是 **12 / 20**，开锁始终要求确认。14 个问题一次请求在实例内 p50 **88 ms**。结论：接口同形，但**不能只换 base URL**；零样本离可用还差校准 / 微调（起步计划第 3–4 步）。详见文末。

> 资料来源：Laya 模型卡与 README（laya 0.3.20，2026-10-03 更新）。对比表里的 Laya 数字以及"Laya vs Jev"数字都是 **Laya 作者公布的**，其中 Jev 一侧是作者引用的第三方测量；标明"本仓库实测"的除外。本仓库的实测只覆盖 B4，见文末。

## 对比

| 维度 | Jev（TypeSafe） | Laya（Convai Innovations） |
|---|---|---|
| 形态 | 闭源托管 API | 开放权重，`pip install laya`，本地 / 自有 GPU / Docker |
| 许可与价格 | $0.042 / Mtok 输入，输出免费 | Apache 2.0，自托管 $0（只有算力成本） |
| 接口 | `POST /v1/systemone`，`@typesafe-ai/sdk` | `laya-serve` 暴露**同形**的 `POST /v1/systemone`；也有 Python SDK、MCP、LangChain |
| 原语 | Choice / Score / Noul | 同样三种；另有 `action.act_probability`（作者自认目前无信号，#185） |
| 模型 | 未公开 | 三个检查点：英文 `laya`（ModernBERT-large，421M，512 tokens）、`laya-multilingual`（mmBERT-base，322M，1,024 → 8,192 tokens）、`laya-typed-decisions`（在作者基准上微调过的英文版）；`Router` 按文字自动选检查点 |
| 上下文 | 每请求 64k；state + 最长问题 ≤ 32k | 英文版**每个问题** 512 tokens：选项与问题约 192，state 约 320；多语言版 1,024（选项 256），可放宽到 8,192 |
| 选项数 | 最多 255 个选项仍可用 | 所有选项共享 192 / 256 tokens 预算；Banking77（77 类）0.425 vs Jev 0.870，作者建议 50 个以上选项时分两级问 |
| 延迟 | 官方约 100–150 ms；第三方 p50 236–276 ms；**本仓库从本地网络实测 0.35–0.8 s** | T4 GPU：1 题 33–40 ms、10 题 72–159 ms；CPU 193–464 ms（作者数字）；无网络往返。**本仓库实测**：B4 的 14 题一次请求，T4 实例内 p50 88 ms |
| 零样本准确率 | typed-decisions 0.727（第三方） | 基础检查点 **0.362**，低于多数类基线 0.461；微调后的 `laya-typed-decisions` 0.766。作者原话：Laya 是"可以专门化的快速底座，不是零样本决策引擎" |
| 校准 | RLCD，出厂即校准；ECE 0.144 / 0.246（作者引用的两个第三方数字） | **出厂过度自信**（ECE 0.466）；按（问题类型, 选项数）拟合温度后为 0.081。必须用自己的数据再校准 |
| 语言 | 英文为主，CJK 可用但较弱 | 作者测试的 51 种语言中 45 种可用（多语言检查点）；中文的单独结果未公布 |
| 微调 | 不支持；用 state / instructions / criteria 适配 | 支持；官方 Kaggle 免费 2×T4 notebook，从数据集到温度拟合到推送一条龙 |
| 已知短板 | jaggedness 清单（字面理解、算数、日期、多跳、context rot……，见 `03`） | Score 最弱（SST-5 0.372）；**Noul 可能跟着 `false:` / `true:` 标签走而不看 state**，对明显的"是"给出很自信的"否"（#156，英文版最明显），作者给的绕法是改成两选项 Choice；高基数选项；长文档（4k tokens 以上结果不稳） |

### 怎么读这张表

- **Laya 的优势是部署属性**，不是判断质量：快一个数量级（省掉网络往返之后更明显）、零边际成本、数据不出机器、能用自己的数据微调。
- **Jev 的优势是零样本质量**：开箱即用的准确率与校准、长上下文、高基数选项。本仓库所有场景都是"写好问题就上线"的零样本用法，这恰好是 Laya 最弱的用法。
- 两者共享同一套设计模式（`04`）：speculative fan-out、置信度路由、"判断即数据"、代码先行。场景代码里的问题、门限、组合逻辑都可以原样复用。

### 第三方评测：JevBench v1.3.0

Hugging Face 社区文章 [Jev vs Laya: Hosted API or Open Weights? (2026 Guide)](https://huggingface.co/blog/sora-2/jev-vs-laya-hosted-api-or-open-weights-2026-guide)（2026-09-24，非官方）引用了 JevBench v1.3.0（2026-09-22 核对）：52 个系统、534 道类型化判断题（72 简单、96 标准、146 评判型、220 困难）。

| 指标 | Jev 1.13.0 | Laya（未调优） |
|---|---|---|
| 综合分（排名） | **74.4**（#1） | 54.4（#33） |
| 智能分 | 85.7 | 45.8 |
| 校准分 | 82.7 | 62.5 |
| 困难题准确率 | 74.1% | 34.1% |
| 标准题准确率 | 99.0% | 72.9% |
| 延迟 | 托管 p50 0.65 s | CPU 0.79 s（原始）/ 1.72 s（调整后）；T4 上是几十毫秒，与 CPU 数字不可直接比 |

和本仓库的 B4 实测方向一致：Jev 20 / 20，Laya 调整请求格式后 12 / 20，这接近它"标准题 72.9%"的量级。文章的结论与本文相同：没有标注数据、要长上下文、没有 GPU 运维能力时先用 Jev；数据必须留在内网、要多语言路由、能微调时评估 Laya。它也明确说 **Laya 不是即插即用的替代品**，生产质量取决于微调与校准。

文章给的评估清单可以直接当作 B4 之后的验收框架：

1. 冻结 schema、标签、平局规则，以及"未知"的含义；
2. 建留出集，覆盖常规、歧义、多语言、长上下文、高风险各类样本；
3. 比较每类 F1、混淆对、校准、按门限的覆盖率与弃答率（弃答越多，已答部分的准确率越高，所以两者要一起报）；
4. 测 p50 / p95 延迟、吞吐、冷启动、失败与截断；
5. 总成本算上标注、GPU 利用率、托管、监控、维护与 API 费用；
6. 让两个系统对照人工复核结果做影子运行，之后再开启有后果的动作。

## 对本仓库的意义：切换只要一个环境变量

`@typesafe-ai/sdk` 读取 `TYPESAFE_BASE_URL`，所以理论上：

```bash
TYPESAFE_BASE_URL=http://127.0.0.1:8000 TYPESAFE_API_KEY=unused JEV_CACHE=off npm run dev
```

整个应用就会改问本地的 `laya-serve`。但 B4 实测表明**这样换过去几乎不可用**（3 / 20），注意四个坑：

1. **必须 `JEV_CACHE=off`**。缓存键是 `state + questions + model`，不含 base URL：读写模式下命中会**悄悄返回 Jev 的旧答案**（你以为在测 Laya），未命中则会把 Laya 的答案**写进提交到仓库的 Jev 缓存**。
2. **费用与模型名会说谎**：`jevCostUsd` 仍按 Jev 价格计费，轨迹里的 `model` 是服务端回什么就显示什么。要正式接入，需要在轨迹里加一个"后端"字段，并让成本卡把 Laya 记为 $0。
3. **对象形式的 state 基本被无视**（实测）。B4 的 state 是 `{request, rooms, devices}`，指令里用 `` `request` `` 指代字段；Laya 对 22 条不同指令给出几乎相同的答案（类别概率接近均匀，房间一律 `whole_house`）。把 state 换成指令原文、指令里写 "this request" 之后，Choice 与 Jev 的一致率从 20% 升到 76%。本仓库很多场景都用对象 state，接入时需要逐场景改成文本。
4. **`confidence` 不是同一个东西**（实测）。Laya 的 `confidence` 与 Jev 的不同义：同一个答案，最高概率 0.27，`confidence` 只有 0.0015；Laya 另给 `answer_confidence`（等于所选标签的概率）。本仓库的门限都按 Jev 的 `confidence` 定，直接用会让 Laya 的答案大量落到"追问"。回放脚本用 `LAYA_GATE=answer` 改按 `answer_confidence` 过门限，这也只是权宜之计，最终要靠第 3 步的校准。

已确认没问题的：`laya-serve` 接受值为 `null` 的选项描述和带 `true` / `false` 描述的 Noul，也返回 `usage`（含是否截断；B4 的 22 条请求均未截断）。

## 场景逐一筛选

按缓存里的真实请求估算（约 4 字符 / token，按英文检查点的 192 / 320 预算判断）：

| 场景 | 每题 state 最大 | 每题问题+选项最大 | Choice / Score / Noul | 结论 |
|---|---|---|---|---|
| A1 原语实验室 | 95 | 130 | 5 / 4 / 14 | 可以做冒烟，但不是业务场景 |
| A2 工单分流 | 150 | **235**（10% 的题超预算） | 48 / 48 / 144 | **第二个**：模型卡的 quickstart 就是工单分流；但部门 Choice 带 `what / not_for / examples` 超预算，垃圾风险硬规则依赖 Noul |
| A3 逐行语义搜索 | **11,058** | **685**（218 个选项） | 6 / 0 / 12 | 不适合：两项预算都超一个数量级 |
| B1 护栏 + 路由 | 116 | 194 | 36 / 36 / 108 | 暂不：自伤 / 越狱 / 有害都是 Noul，#156 的"自信的否"在这里就是漏拦 |
| B2 引用核验 | **684** | 75 | 7 / 0 / 7 | 不适合：29% 的题 state 会被截断 |
| B3 RAG 守门 | 350 | 80 | 0 / 0 / **240** | 不适合：全是 Noul，state 贴着上限 |
| **B4 智能家居** | **53** | **80** | **242 / 0 / 66** | **第一个**（理由见下） |
| C1 作业评分 | 310 | 143 | 12 / 24 / 60 | 暂不：Score 多、作答长度贴近上限 |
| C2 患者分诊 | 54 | 178 | 16 / 32 / 128 | 暂不：结构合适，但医疗红旗全是 Noul，不适合当第一个试验品 |
| C3 公告重大性 | 176 | **284**（13% 超预算） | 30 / 15 / 75 | 不适合：13 类事件的选项超预算 |
| C4 VPP 通知 | 92 | 192（贴线） | 72 / 36 / 216 | 之后再看：Noul 占三分之二 |
| C5 音乐盒 | 39 | 106 | 4 / 16 / 8 | 暂不：一半以上是最弱的 Score |

## 为什么从 B4 开始

1. **结构最贴合**：state 最长约 53 tokens、问题+选项最长约 80 tokens，远低于 320 / 192 的预算；每个 Choice 最多 7 个短选项；**没有 Score**；79% 是 Choice，Noul 只有 3 个（`is_compound`、`is_question_about_state`、仅作展示的 `mentions_number`）。
2. **公开证据离它最近**：模型卡里 Laya 英文 MASSIVE（语音助手指令意图）0.783，这正是智能家居指令这一类任务；而 B4 把一个 60 类的意图问题拆成了多个 4–8 选项的小 Choice，正好避开 Laya 的高基数短板。
3. **Laya 独有的优势在这里最值钱**：智能家居中控适合在本地、离线运行；语音指令对延迟敏感（Jev 在本网络 p50 580 ms，Laya 作者数字是 GPU 上每请求几十毫秒）；家里的语音指令不出局域网；常开设备按次付费也不划算。
4. **出错的代价有界**：分派器本来就有安全网——开锁**永远**要求确认，与置信度无关；数字只来自正则；房间或设备不确定就追问。Laya 答错的最坏结果是开错一盏灯或多问一句。
5. **可以量化**：20 条带预期分派结果的标注指令（`examples.ts`），加上 22 条 Jev 缓存答案作参照，`scripts/laya-replay.ts` 一次跑出两种对比。
6. **失败模式有现成的修法**：如果 #156 打在 `is_compound` 或 `is_question_about_state` 上，按作者的建议改成两选项 Choice 即可，只涉及 3 个问题。

A2 是第二站：一旦 B4 证明了接入、校准与微调流程，再去碰需要超预算选项、Score 与 Noul 硬规则的工单分流。

## 起步计划

| 步 | 做什么 | 通过标准 |
|---|---|---|
| 0 | 装 Laya 并起服务：`pip install "laya[serve]"`，`USE_TF=0 LAYA_PRELOAD=1 laya-serve`（默认 `0.0.0.0:8000`、无鉴权；本机试验建议设 `LAYA_API_KEY`） | `curl localhost:8000/v1/systemone` 能返回答案 |
| 1 | 零样本回放：`LAYA_URL=http://127.0.0.1:8000 npx tsx scripts/laya-replay.ts b4`；再加 `LAYA_STATE=text LAYA_GATE=answer` 跑一次 | 开锁从不直接执行（硬性）；分派命中 ≥ 18/20；记下延迟 p50 与各题一致率。**实测：开锁 ✔；3 / 20 → 10 / 20，未达标** |
| 2 | 若 Noul 题与 Jev 分歧大，把它们改写成两选项 Choice 再跑一次（`LAYA_NOUL=choice`） | 3 个 Noul 题的分派结果不再出错。**实测：`is_compound` 一致率 10 → 13 / 22，分派 12 / 20；仍有一条复合指令没被拆分** |
| 3 | 温度校准：B4 的门限（0.5 / 0.6 / 0.7 / 0.85）默认概率是校准过的，而 Laya 出厂过度自信。20 条太少，先用 Jev 当老师标注约 200 条合成指令（每条约 1,420 tokens，总计约 $0.012），按（问题类型, 选项数）拟合温度 | 校准后在留出集上门限附近的分派与 Jev 一致 |
| 4 | 第 1–3 步仍达不到标准时，用作者的 Kaggle notebook 拿这批 Jev 标注做蒸馏微调（与 `laya-typed-decisions` 的做法一样） | 留出集分派命中不低于 Jev |
| 5 | 接进页面：`TYPESAFE_BASE_URL=… JEV_CACHE=off npm run dev`，在 `/b4` 上手动跑；再给轨迹加"后端"字段、让成本卡把 Laya 记为 $0 | 页面能标明答案来自 Laya，费用显示正确 |

## 实测回填

`scripts/laya-replay.ts` 把缓存里某个场景的 Jev 请求原样发给 `LAYA_URL/v1/systemone`（不经过 `askJev`，不会写 Jev 缓存），逐题比较：Choice 看标签是否相同，Noul 看是否在 0.5 的同一侧，Score 看差值是否 ≤ 0.5；B4 还会用真实的 `dispatch()` 对两套答案求分派结果并与标注比对。结果写入 `docs/results/laya-vs-jev-<场景>-<时间>.json`。

变体开关：`LAYA_STATE=text`（只发 `request` 原文，指令里的 `` `request` `` 换成 "this request"）、`LAYA_NOUL=choice`（Noul 改问 yes / no 两选项 Choice，再把 P(yes) 还原成 Noul）、`LAYA_GATE=answer`（按 `answer_confidence` 过门限）。三个开关都只改发给 Laya 的请求或回来的答案，不改 `shared/` 里的问题定义。

| 日期 | 场景 | 检查点 / 设备 | 变体 | 与 Jev 一致率（Choice / Noul） | 分派命中 Laya vs Jev | 延迟 p50 Laya vs Jev | 结果文件 |
|---|---|---|---|---|---|---|---|
| 2026-10-08 | B4 | `laya` 英文（Router 自动选择）/ g4dn.xlarge T4 | 原样 | 20% / 59% | **3** / 20 vs 20 / 20 | 357 ms（经隧道）vs 692 ms | `laya-vs-jev-b4-2026-10-08T01-54-11-818Z.json` |
| 2026-10-08 | B4 | 同上 | `GATE=answer` | 20% / 59% | 3 / 20 | 354 ms | `…-b4-answergate-…` |
| 2026-10-08 | B4 | 同上 | `STATE=text` | 76% / 74% | 8 / 20 | 308 ms | `…-b4-text-2026…` |
| 2026-10-08 | B4 | 同上 | `STATE=text GATE=answer` | 76% / 74% | 10 / 20 | 312 ms | `…-b4-text-answergate-…` |
| 2026-10-08 | B4 | 同上 | `STATE=text NOUL=choice` | 76% / 80% | 9 / 20 | 314 ms | `…-b4-text-noulchoice-2026…` |
| 2026-10-08 | B4 | 同上 | **三个开关全开** | **76% / 80%** | **12 / 20** | 308 ms；**实例内 88 ms** | `…-b4-text-noulchoice-answergate-…` |

- 延迟：表中 Laya 的数字都是从本地经 SSM 端口转发到 us-east-1 测的，含两段网络往返；同一个 14 题请求在实例内连发 20 次，p50 88 ms（87–89 ms）。Jev 的 692 ms 是本地网络到 Jev 的实测。
- 开锁：所有变体下 "unlock the front door" 都走 `confirm_lock`，没有直接执行。
- 最好的一组还有 8 条不中，都出在模型判断，不再是格式问题：
  - 寒暄（"hi there"、"thanks, that's all"）被归到 `other`（"None of the above"），于是追问；
  - "set the bedroom to 21 degrees"、"play some music in the bathroom"、"set the office volume to 4" 的设备被判成 `not_stated`，或者温控动作给了 `warmer`；
  - 没提房间时倾向 `whole_house`；
  - 一条复合指令没有拆分，"turn the TV off" 被误拆。
- 下一步就是起步计划第 3 步：用 Jev 当老师标约 200 条合成指令，做温度校准；不够再做第 4 步的蒸馏微调。对象 state → 文本的改写应当在接入层做，不要改 `shared/` 里给 Jev 用的问题。

注意：与 Jev 一致不等于对。Jev 的答案只是参照；能当真值的只有 B4 的 20 条标注分派。

## 资料

- Laya 模型卡：[huggingface.co/convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya)
- 代码与基准报告：[NandhaKishorM/laya](https://github.com/NandhaKishorM/laya)，其中 [`BENCHMARKS.md`](https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md)、[Kaggle 2×T4 微调 notebook](https://github.com/NandhaKishorM/laya/blob/main/notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb)
- 文档：[nandhakishorm.github.io/laya](https://nandhakishorm.github.io/laya/)
- 已知问题：Noul 跟随标签 [#156](https://github.com/NandhaKishorM/laya/issues/156)、act_probability 无信号 [#185](https://github.com/NandhaKishorM/laya/issues/185)
- 第三方（社区文章，非官方）：[Jev vs Laya: Hosted API or Open Weights? (2026 Guide)](https://huggingface.co/blog/sora-2/jev-vs-laya-hosted-api-or-open-weights-2026-guide)，含 JevBench v1.3.0 数字与评估清单
