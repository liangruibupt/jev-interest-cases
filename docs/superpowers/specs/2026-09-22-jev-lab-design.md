# Jev Lab：学习 Jev 并构建 8 个可视化场景

## 1. Context（为什么做）

用户想系统学习 **Jev**（TypeSafe 公司的首个 "System One" 模型）并亲手构建一批**可视化、有实际价值**的场景，理解 Jev 相对普通 LLM 的优势，以及 Jev 与 Claude 协作的模式。仓库 `jev-interest-cases` 目前为空（只有 `.git`）。

Jev 不是聊天/生成模型：它接收一个 `state` 和一组**类型化问题**（Choice / Score / Noul），返回**校准过的概率**和置信度，约 100–150ms，输入 $0.042/Mtok、输出免费。代码掌控流程，Jev 只在需要语义常识的节点给出一个可阈值化、可排序、可组合的数字。

已确认的决定（用户回答与反馈）：

| 决定 | 结论 |
|---|---|
| Jev API key | 已有，导出到 `TYPESAFE_API_KEY` |
| Claude 通路 | **AWS Bedrock runtime 端点**（`AnthropicBedrock` + 推理配置 ID），`AWS_PROFILE=global_ruiliang`，`us-east-1`（凭证已验证，账号 710299592439） |
| Claude 模型 | **4.6 或 5 系列**：Sonnet 5 / Opus 5 为主力，Sonnet 4.6 / Opus 4.6 作上一代对照，Fable 5.1 可选前沿层；Haiku 4.5 默认关闭 |
| 技术栈 | TypeScript 全栈：Vite + React 前端，Node(Hono) 后端 |
| 数据语言 | 英文演示数据 + 中文界面与文档（Jev 英文准确率最高，CJK 偏弱） |
| 场景 | 全部 8 个：A1 A2 A3 A4（纯 Jev）+ B1 B2 B3 B4（Jev + Claude） |
| 组织形式 | 单一 Web 应用，多场景页面，共享导航 / 请求检视器 / 费用仪表 |
| 成本对比 | **每个场景给出 Jev 带来的成本下降预估比例**，并在应用内置"LLM 基线估算 vs Jev 实际"仪表（§5） |

## 2. 事实速查（写代码时依据）

**Jev / TypeSafe**（https://docs.typesafe.ai/llms.txt 为索引）
- 端点 `POST https://api.typesafe.ai/v1/systemone`，Bearer 鉴权。SDK `@typesafe-ai/sdk` 0.6.0（Node ≥20）：`new TypeSafeClient({apiKey?, defaultModel?, timeout?, retry?})`，`client.systemOne({state, questions, model?})`，helper `choice()/score()/noul()`，答案类型按问题推断；`client.models.list()`。
- 模型 `jev-latest` → `jev-1.13.0`。64k tokens/请求；state + 最长问题 ≤ 32k。限流 250k tok/s、1200 rpm（cookbook 经验：并发 >8 会被限流）。仅文本。
- **Choice**：`criteria: {option: description|null}`，≤255 选项；返回 `choice, probabilities(和为1), confidence`。
- **Score**：`criteria` 为 2–10 级有序数组（描述"情境"不是"程度"）；返回 `score`（概率加权，可落在两级之间）、`legend, probabilities, confidence`。
- **Noul**：是/否；返回 `noul ∈ [0,1]`，无 confidence；可选 `criteria: {true, false}`。
- `instructions`/`criteria` 可为 string | object | array（结构化字段名自定，如 `{question, focus}`、`{what, not_for, examples}`）。反引号路径引用 state：`` `ticket.messages[0].text` ``。问题 ID 不发给模型。
- 同一 state 的所有问题**一次请求打包**（speculative fan-out），并行且互相独立；只有当后续问题依赖前一答案来构造新 state/新选项时才发第二次请求。
- jaggedness（https://docs.typesafe.ai/model-jaggedness/jev-1.13.md）：字面理解、不会算数/计数、不会比较日期、多跳间接推理弱、无关 state 越多越差、对抗内容可影响、instructions 与 criteria 矛盾会混乱、不同问法间无结构不变量、不做生成。
- 错误码 401 / 422 / 429 / 529；SDK 默认重试 2 次带退避。
- 官方对比数字：8 题审核请求 Jev 114ms / $0.000046 vs Claude Haiku 4.5 3.85s / $0.0035，Opus 4.8 推理 10.4s / $0.028；13 题打包 vs 13 次单发：12.2× 便宜、10× 快；BM25→Jev 重排 top-1 5%→18%、top-10 38%→62%（1200 次 $0.065）。

**Claude via Bedrock runtime**（来源：claude-api skill、`@anthropic-ai/bedrock-sdk` README、本会话 `aws bedrock list-inference-profiles` 核实）
- 客户端：`import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk"`（0.33.7）；`new AnthropicBedrock({ awsRegion: "us-east-1" })`，走 `bedrock-runtime` InvokeModel，凭证走默认链（`AWS_PROFILE`）。之后用法与 `Anthropic` 客户端相同（`messages.create` / `messages.parse`）。
- 模型用**推理配置 ID**（账号 us-east-1 已列出）：

| tier | 推理配置 ID | 输入 / 输出 $/Mtok | 用途 |
|---|---|---|---|
| `standard` | `global.anthropic.claude-sonnet-5` | 2 / 10 | 默认生成、B1 中档、B4 拆分/闲聊 |
| `strong` | `global.anthropic.claude-opus-5` | 5 / 25 | B1 高复杂度、B2/B3 可选生成层、A4 对照 |
| `prev_sonnet` | `global.anthropic.claude-sonnet-4-6` | 3 / 15 | A4 上一代对照（允许 `temperature`） |
| `prev_opus` | `global.anthropic.claude-opus-4-6-v1` | 5 / 25 | A4 可选对照 |
| `frontier` | `global.anthropic.claude-fable-5-1` | 10 / 50 | 可选；B1 "最强"层演示、成本基线上限 |
| `haiku`（默认关） | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 1 / 5 | 仅为复现官方 cookbook 数字时开启 |

- 价格为 Anthropic 公开价（Bedrock 全球端点同价，区域端点 +10%），常量集中在 `shared/src/pricing.ts`。
- 结构化输出：`client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`，Bedrock 上 GA；`parsed_output` 可能为 null 需判空。**P0 在 runtime 端点上逐 tier 核验**；若某 tier 不支持，则回退 `strict: true` 工具 + `tool_choice: {type:"tool"}`（4.6 / 5 非 Fable 模型允许强制工具；Fable 5.1 禁止，只走 `output_config`）。
- Claude 5 系列（Sonnet 5 / Opus 5 / Fable）**已移除 `temperature`**（传了 400）；4.6 系列允许。Opus 5 默认自适应思考；分类类调用用 `output_config.effort: "low"` 控制开销。
- 读取 `stop_reason`：`refusal` 时不要当空文本处理；`max_tokens` 时提高上限而非重试。
- Mantle 端点（`AnthropicBedrockMantle`，`anthropic.claude-*` ID）仅作为备选记录，不默认使用。
- ESM 下无 `__dirname`，用 `import.meta.url`；`.env` 用 Node 22 `--env-file`。

## 3. 架构

### 3.1 仓库布局（npm workspaces；Node 22.17 / npm 11.8）

```
jev-interest-cases/
├─ package.json                # workspaces: shared, server, web；scripts: dev, build, test, typecheck, smoke, check-env, vendor, cache:clear
├─ tsconfig.base.json          # strict, ESNext, moduleResolution bundler, ES2022
├─ .env.example                # TYPESAFE_API_KEY= AWS_PROFILE=global_ruiliang AWS_REGION=us-east-1 JEV_CACHE=read-write PORT=8787
├─ .gitignore                  # .env, node_modules, dist（注意：server/.cache/jev 提交进仓库，见 §6）
├─ README.md                   # 中文：定位、安装（含 TypeSafe 插件）、启动、学习路径、目录说明
├─ docs/                       # 中文教学文档（§8）+ superpowers/specs/2026-09-22-jev-lab-design.md（本方案副本）
├─ scripts/
│  ├─ vendor-datasets.ts       # 下载 GitHub ToS gist / RFC 7519 → 写成 shared/src/datasets/*.ts（头部注明来源、日期、许可）
│  ├─ check-env.ts             # 探测 TYPESAFE_API_KEY、AWS 凭证、各 tier 可达性与结构化输出支持，各发一次最小请求
│  └─ smoke.ts                 # `npm run smoke -- a2 b1`：用固定输入真实调用 Jev，打印答案/置信度/延迟/费用/组合结果/基线估算
├─ shared/                     # @jev/shared：问题、阈值、纯组合函数、成本模型、数据集。唯一的"可审阅处"
│  ├─ package.json             # "type":"module"，"exports": {".":"./src/index.ts","./*":"./src/*"}，无构建步骤
│  └─ src/
│     ├─ types.ts              # 复用 SDK 的 Question/Answer 类型；JevTrace、ClaudeTrace、Decision 类型
│     ├─ pricing.ts            # JEV_USD_PER_MTOK=0.042；CLAUDE_TIERS 表（上表）
│     ├─ costModel.ts          # 每场景 LLM 基线估算函数（§5）
│     ├─ validate.ts           # validateQuestions()：Choice ≤255 选项、Score 2–10 级、ID 非空 → 先于 API 报错
│     ├─ util/{stableStringify,hash,normalizeText}.ts
│     ├─ datasets/             # vendor 生成：githubTos.ts, rfc7519.ts, tickets.ts, guardrailMessages.ts, ragCorpus.ts, smartHomeCommands.ts, a4Cases.ts
│     └─ scenarios/
│        ├─ a1-playground/presets.ts
│        ├─ a2-triage/{questions,thresholds,compose}.ts
│        ├─ a3-semantic-find/{questions,thresholds,compose,buildState}.ts
│        ├─ a4-consistency/{questions,metrics,arms}.ts
│        ├─ b1-router/{questions,policy,compose,faq}.ts
│        ├─ b2-citations/{questions,thresholds,compose,match,sections}.ts
│        ├─ b3-rag/{questions,thresholds,compose,bm25,corpus}.ts
│        └─ b4-smart-home/{questions,thresholds,dispatch,home,numbers}.ts
├─ server/                     # Hono 4 + @hono/node-server；tsx watch；端口 8787；唯一持有密钥的进程
│  ├─ .cache/jev/*.json        # Jev 响应缓存（提交到仓库，供无 key 回放）
│  └─ src/
│     ├─ index.ts              # 挂载 /api/a1..b4；生产模式 serveStatic(web/dist)；错误中间件
│     ├─ lib/{jev,claude,llmSystemOne,cache,queue,trace,errors,sse}.ts
│     └─ routes/{a1,a2,a3,a4,b1,b2,b3,b4}.ts   # 只编排，逻辑全部调用 shared/
└─ web/                        # Vite 8 + React 19 + TS + Tailwind 4 + react-router + recharts；端口 5173；/api 代理到 8787
   └─ src/
      ├─ main.tsx, App.tsx     # 侧栏导航按学习路径排序 A1→A2→A4→B1→B2→A3→B3→B4
      ├─ i18n/zh.ts            # 全部 UI 文案（中文）；问题原文保持英文并原样展示
      ├─ store/session.ts      # trace 日志 + 累计费用（Jev 实际 / Claude 实际 / LLM 基线估算）
      ├─ components/{RequestInspector,CostMeter,SavingsCard,ProbBars,ScoreLine,NoulGauge,ConfidenceRing,ThresholdSlider,LearningCard,DecisionTrace,LatencyChip,Heatmap}.tsx
      └─ pages/{A1Playground,A2Triage,A3SemanticFind,A4Consistency,B1Router,B2Citations,B3Rag,B4SmartHome}.tsx
```

边界理由：问题文本、阈值、权重、路由规则、成本模型全部在 `shared/`，所以（a）UI 能展示"将要发送的原始问题 JSON"，（b）拖滑杆时在浏览器重跑组合函数、零推理，（c）vitest 无网络测试组合逻辑，（d）符合 TypeSafe skill "常量集中一处便于审阅"。数据集 vendored 为 `.ts` 模块，tsx / Vite / vitest 三方零加载配置。`shared` 无构建步骤（`exports` 指向 `.ts`）。

开发：根 `npm run dev` 用 `concurrently` 同时跑 `server: tsx watch --env-file=.env src/index.ts`（若 tsx 不转发该 flag，改 `node --env-file=.env --import tsx src/index.ts`）和 `web: vite`。

### 3.2 server 核心模块

**`lib/jev.ts`**
```ts
askJev({ scenario, state, questions, model? }, { cache?: 'off'|'read-write'|'read-only' })
  → { result: SystemOneResult, trace: JevTrace }
JevTrace = { id, scenario, startedAt, latencyMs, cached, model /*jev-1.13.0*/, request:{state,questions,model},
             response:{answers,usage}, cost:{usd = input_tokens/1e6*0.042} }
```
- 单例 `TypeSafeClient`（`defaultModel = JEV_MODEL ?? 'jev-latest'`，timeout 15s，SDK 默认重试）。
- 所有调用经 `queue.jev = p-limit(6)`。
- 发送前 `validateQuestions()`，让 422 只会是真 bug。
- 缓存键 `sha256(stableStringify({state,questions,model}))` → `server/.cache/jev/<key>.json`（存完整 trace；回放时 `cached:true`、延迟显示为"缓存"芯片，不伪造速度）。默认模式取 `JEV_CACHE`；A4 与 A1 实时模式强制 `off`。

**`lib/claude.ts`**
```ts
CLAUDE_TIERS   // shared/pricing.ts，见 §2 表；单一配置对象
claudeText({ scenario, tier, system?, messages, maxTokens, effort? })                 → { text, trace }
claudeParse<T>({ scenario, tier, system?, messages, maxTokens, schema: ZodType<T> }) → { parsed: T, trace }   // messages.parse + zodOutputFormat；不支持时回退 strict tool
ClaudeTrace = { id, scenario, tier, model, latencyMs, inputTokens, outputTokens, cost:{usd}, stopReason }
```
- `new AnthropicBedrock({ awsRegion })`；`queue.claude = p-limit(3)`；Bedrock ThrottlingException → 抖动退避重试 3 次 → 503 中文提示。
- `stop_reason === 'refusal'` → 抛 `ClaudeRefusalError`（UI 显示类别）；`parsed_output === null` → `ClaudeStructuredOutputError`（记录原文）。
- 4.6 系列可传 `temperature`；5 系列不传。分类类调用 `output_config.effort:"low"`，生成类默认 `high`。
- 默认生成 tier = `standard`（Sonnet 5）；B1 由路由决定实际 tier；B2/B3 生成 tier 可在 UI 切换到 Opus 5 / Fable 5.1（顺带演示费用差异）。
- `check-env.ts` 逐 tier 发一次最小 `messages.parse`，记录支持情况到 `.env`（`STRUCTURED_OUTPUT_MODE=parse|tool`）。

**`lib/llmSystemOne.ts`**（A4 对比用，TypeSafe 官方 Python `system-one-adapter` 的 TS 移植）
- `askLlmSystemOne({ scenario, state, questions, tier, temperature? })` → 与 `askJev` 同形 `{ result, trace, debug }`。
- 动态构造 Zod schema：每题一个键；Choice → `{ probabilities: { [opt]: number(0..1) } }`；Score → 键 `"0".."n-1"`；Noul → `{ p_yes: number }`；`claudeParse` 一次拿回全部。
- 固定英文 system prompt："You are a calibrated decision model. Read STATE literally. For every question return a probability distribution over exactly the listed options that sums to 1.0… Do not add options, text, or explanations." user 消息 = `STATE:\n<json>\n\nQUESTIONS:\n<json of {id:{type,instructions,criteria}}>`。
- 后处理（对所有 LLM 臂一致）：裁剪到 [0,1]；和 ≤0 → 均匀分布并标 `degenerate`；否则归一化并记录 `normalizationDelta`。`choice=argmax`，`score=Σ i·p_i`，`noul=p_yes`。**`confidence = null`**（Jev 的 confidence 公式未公开，A4 只用概率比较，与官方 cookbook 一致）。
- `max_tokens = 256 + 16 × 选项总数`；schema 失败重试 1 次（把校验错误作为追加 user 轮）；refusal 计入无效轮。

### 3.3 web 共享组件
- **RequestInspector**：抽屉列出本次动作的所有 trace（模型 ID、延迟、tokens、费用、缓存芯片）；展开显示发送的 `state/questions` 与返回 JSON，可复制。
- **CostMeter**（顶栏）：会话累计 Jev 实际 / Claude 实际 / LLM 基线估算、调用次数、平均延迟。
- **SavingsCard**（每页）：本场景"若全用 LLM 的基线估算 vs 实际" → 节省 %，展开可见假设（tokens、tier、公式），tier 下拉可切换基线模型。
- **ProbBars / ScoreLine / NoulGauge / ConfidenceRing / LatencyChip / ThresholdSlider / DecisionTrace / Heatmap / LearningCard**。
- 实现前先读 `dataviz` skill（图表配色/形式）与 `frontend-design` skill（页面视觉）。

## 4. 场景设计

每个场景的统一响应包 `{ data, traces, baseline }`；每页都有 RequestInspector、SavingsCard 与 LearningCard（这证明了什么 / 试试这个 / 陷阱）。问题最终以 `shared/src/scenarios/*/questions.ts` 为准，下面是草稿。

### A1 原语实验室
- **证明点**：三种原语的返回形状；~100ms 可嵌入 UI 交互；字面理解与计数陷阱；结构化 criteria 的效果。
- **路由** `POST /api/a1/evaluate {state, questions, live?}`（唯一允许前端自定义问题的端点；≤12 题、state ≤12k 字符；`live` 时缓存 off）。
- **预置组**（`presets.ts`，每组 `{title_zh, lesson_zh, state, questions}`）：
  1. 快速开始：quickstart 工单 + `department` Choice / `frustration` Score / `is_urgent` Noul。
  2. 结构化 state 与反引号路径：ticket + order.charges + refund_policy；`Does \`ticket.messages[0].text\` request a refund?`、`Does \`refund_policy\` support the refund requested in \`ticket.messages[0].text\`, given \`order.charges\`?`。
  3. 字面理解陷阱：`Is the message free of personal data?`（反向）vs `Does the message contain personal data?`。
  4. 不要让它数数：`items:[...]`，坏问法 Choice `How many items are fruits?` {0..8}；好问法 8 个 Noul `Is \`items[i]\` the name of a fruit?`，UI 在代码里求和。
  5. 数字级别 vs 情境级别：severity Score `["0","1","2"]` vs 三条情境描述（文档：0.55/0.33 vs 0.0/1.0）。
  6. 对照式 criteria：`return_policy` vs `return_status`，各带 `{what, not_for, examples}`。
  7. CJK 对照：同一条工单的中文版，观察置信度下降（对应文档"语言支持"）。
- **UI**：左侧预置选择、state 编辑器（文本/JSON 切换 + 校验）、问题卡片（类型、instructions、criteria 编辑、"查看 JSON"）、评估按钮、"实时模式"开关（400ms 防抖）。右侧每题一张答案卡：Choice → 排序 ProbBars + ConfidenceRing；Score → 级别条 + 期望值标记 + legend；Noul → 三区仪表（NO<0.2 / 灰区 / YES>0.8）。底部延迟、tokens、费用、模型 ID、SavingsCard。
- **验证**：vitest `presets.test.ts`（全部通过 `validateQuestions`；预置 4 恰好 8 个 Noul）；smoke：预置 1 `is_urgent > 0.8`，预置 3 两问结果相反；Playwright 截图 `a1.png`。

### A2 工单分流看板
- **证明点**：speculative fan-out（10 题一次请求）、confidence-gated routing、"判断即数据"（改阈值零推理）。
- **数据**（`tickets.ts`）：24 条手写英文工单 `{id, subject, message, sender:{display_name,email}, links, customer:{plan, open_orders}}`：billing 6、orders 5、account 4、technical 5（2 条含复现步骤）、钓鱼 2、跨主题歧义 2。
- **state**：`{ ticket:{subject,message,sender,links}, customer:{plan,open_orders}, policy:{sensitive_credentials:["password","security code","API key","one-time code"]} }`。
- **问题（10，一次请求）**：

| id | 类型 | 草稿 |
|---|---|---|
| department | Choice | `{question:"Which team should handle \`ticket.message\`?", focus:"Classify the customer's primary request, not every topic mentioned."}`；billing/orders/account/technical 各带 `{what, not_for, examples}`；other "None of the above" |
| requested_resolution | Choice | "What does the customer want to happen?"：refund / exchange / replacement / information / fix / other |
| bug_severity | Score（speculative） | "If \`ticket.message\` reports a defect, how severe is it?"：Cosmetic / Broken but workaround exists / Blocking, no workaround |
| has_repro_steps | Noul | "Does \`ticket.message\` describe specific steps to reproduce a problem?" |
| refund_requested | Noul | "Does \`ticket.message\` explicitly ask for money back or an account credit?"，false 带 `not_for:"A billing complaint without a requested remedy"` |
| requests_credentials | Noul | `{question:"Does \`ticket.message\` ask the recipient to disclose a credential listed in \`policy.sensitive_credentials\`?", focus:"A request to send the credential itself, not to reset it."}` |
| sender_identity_mismatch | Noul | "Does the organization named in \`ticket.sender.display_name\` conflict with the domain of \`ticket.sender.email\`?" |
| unexpected_reward | Noul | "Does \`ticket.message\` announce an unrequested prize, bonus, or payment?" |
| mentions_open_order | Noul | "Does \`ticket.message\` refer to one of \`customer.open_orders\` by id or identifying details?" |
| frustration | Score | "How frustrated does the customer appear in \`ticket.message\`?"：Calm / Frustrated but civil / Very angry, hostile, or threatening to leave |

- **组合**（`compose.ts` 纯函数；`THRESHOLDS = {DEPT_MIN_CONF:0.6, SPAM_REVIEW_LO:0.4, SPAM_BLOCK:0.6, REFUND_YES:0.7, SECOND_TEAM_MIN_PROB:0.25, SEVERITY_HIGH:1.5}`，权重 `{cred:0.45, mismatch:0.30, reward:0.25}`）：
  1. `spamRisk = Σ w·noul`；≥ SPAM_BLOCK → 隔离；(LO, BLOCK) → 人工复核。
  2. `department.confidence < DEPT_MIN_CONF` → 人工复核（reason 记录数值）。
  3. 否则泳道 = department；其它概率 ≥ 0.25 的部门 → 抄送标签。
  4. `priority = 0.5·frustration/2 + 0.5·(technical ? bug_severity/2 : 0)`；徽章：退款、可复现、提到未完成订单。
  返回 `{lane, priority, badges, ccTeams, reasons[]}`。
- **路由** `GET /api/a2/tickets`；`POST /api/a2/evaluate {ticketIds?}`（服务端经 `queue.jev` 扇出，每工单一请求）。
- **UI**：顶部"评估全部"（进度、请求数、总延迟、总费用）；六泳道 账单/订单/账户/技术/人工复核/隔离；卡片含部门迷你概率条、愤怒度芯片、徽章、抄送；点击 → 该工单 Inspector + "为什么在这里"。右栏 ThresholdSlider 绑定 `THRESHOLDS`，拖动即在浏览器重跑 `compose`（角标"0 次新推理"，SavingsCard 同时累计"省下的重跑次数"）。开关"显示被忽略的 speculative 答案"。
- **验证**：vitest `compose.test.ts`（阈值边界、垃圾区间、technical 优先级、抄送）；smoke 打印 6 条 id/部门/置信度/spamRisk/泳道；Playwright：评估全部 → 六泳道有卡片 → 拖 DEPT_MIN_CONF 到 0.9 → 人工复核增加 → 截图。

### A3 文档逐行语义搜索
- **证明点**：无 embedding、无生成，用 Choice 概率做相关度；**Choice 概率和为 1，必须配 Noul 判"文档里有没有答案"**。
- **数据**：GitHub ToS gist 218 行 / 42,803 字符（源仓库 github/site-policy 为 CC0 1.0）→ `githubTos.ts`。
- **state**：`lines.map((l,i)=>\`L${pad3(i)}| ${l}\`).join('\n')`（≈11k tokens，每查询 ≈ $0.0005），`buildState()` 构造一次。
- **问题（一次请求）**：`where` Choice `Which line of the document contains the answer to: "${query}"?`，criteria `{L000:null…L217:null}`；`exists` Noul `Does any line of the document address or answer: "${query}"?`（true "At least one line states or directly implies the answer" / false "No line addresses this question"）；`spans_multiple` Noul（speculative）`Is the answer to "${query}" spread across more than one line of the document?`。
- **组合**：`FOUND 0.7 / ABSENT 0.35` → 已回答 / 部分涉及 / 文档未涉及；`ranked` = 概率降序保留 ≥0.03 或 top-5；`spans_multiple ≥ 0.6` 时高亮 top-3。
- **UI**：查询框 + 6 个示例（cookbook 4 个 + "can I use GitHub for cryptocurrency mining?" + "what happens to my data if I delete my account?"）；文档视图行号 + 概率热度高亮 + 自动滚动；右栏 `exists` 三区仪表、top-5、延迟、费用；开关"忽略 exists"并排显示"总能选出一行"的天真结论。
- **验证**：vitest `buildState` 产出 218 个 ID 且与 criteria 键一致、阈值分类；smoke 复现 cookbook：ownership → L052 top，arbitration → exists < 0.35；截图。

### A4 一致性与校准对比实验
- **证明点**：用自己的数据复现 Jev 的稳定性/延迟/成本；Claude 通过 `llmSystemOne` 回答**同一组**问题。
- **数据**（`a4Cases.ts`）：case 1 = 自写的边界审核帖（游戏论坛帖含 Discord 邀请、1 次前科、4 次举报）+ 8 个 Choice（category / primary_risk / target / action / queue / link_handling / review_path / severity，措辞仿 cookbook）；case 2 = A2 的第 7 号工单 + 6 个混合类型问题。
- **臂**（`arms.ts`）：`jev`、`sonnet-4.6-t0`（temperature 0）、`sonnet-4.6-default`、`sonnet-5`、`opus-5`；可选 `fable-5.1`、`haiku-4.5`（复现官方数字用）。5 系列无 temperature 参数，UI 注明。每轮 state 加 `uid:"<case>:<i>:<nonce>"`（复现 cookbook 做法，学习卡说明其局限）；缓存 off。
- **路由** `POST /api/a4/run {caseId, runs(3..15), arms}` → **SSE**（`hono/streaming` `streamSSE`）逐轮推送 `{arm, run, answers, latencyMs, cost}` 直至 `done`；臂之间并发、臂内串行（延迟诚实）。
- **指标**（`metrics.ts` 纯函数）：每（臂,题）模态标签、原始一致率、按 `MIN_CHOICE_PROB 0.6` 引入 `uncertain` 的策略一致率、uncertain 占比、各选项概率标准差均值；每臂 平均/中位延迟、总费用与单次费用、相对 Jev 倍数。
- **UI**：控制区（案例、轮数滑杆、臂复选、开始前费用预估）；热力图 行=问题 列=轮 色=标签 网纹=uncertain，每臂一块；条形：延迟（对数）、单次费用（对数）、标准差；cookbook 格式汇总表；结论条自动生成（"Jev 比 Sonnet 5 快 N 倍、便宜 M 倍，标签一致率 X% vs Y%"）。
- **验证**：vitest metrics 夹具（全同→100%、交替→50%、uncertain 规则）；smoke `a4` = 3 轮仅 Jev；Playwright：runs=3、臂 jev+sonnet-5 → `done` → 截图；结果 JSON 导出 `docs/results/a4-*.json`。

### B1 护栏 + 模型路由（Jev 在 Claude 前）
- **证明点**：Jev 作为成本约为 LLM 1% 的前置分流器与护栏；置信度门限按风险分层；新增延迟可忽略；Harness Engineering。
- **数据**（`guardrailMessages.ts`）：16 条英文消息：FAQ 3、产品问题 3、技术 3（1 条需长推理）、投诉 2（1 条升级）、医疗剂量 1、温和越狱 1（自写，角色扮演"无规则"框架、无有害载荷）、自伤暗示 1、要求真人 1、闲聊 1。`faq.ts` 8 个话题的标准答案。
- **state**：`{ message, recent_context: string[] }`（页面最近 2 轮）。
- **问题（10，一次请求）**：`intent` Choice（faq / account_action / product_question / technical_help / complaint / chit_chat / other，结构化 criteria）；`faq_topic` Choice（speculative，8 话题 + none）；`complexity` Score 3 级（一行事实 / 需要推理或多步 / 深度推理、长代码或异常情况）；`jailbreak`、`harmful_request`、`medical_advice`、`self_harm` Noul（措辞沿用官方 guardrails cookbook）；`severity` Score 4 级（No harm / Mild / Serious / Severe）；`wants_human` Noul；`is_compound` Noul。
- **策略**（`policy.ts`；预设 `strict {REVIEW 0.35, ACT 0.70, SEV_BLOCK 2.0}` / `permissive {0.35, 0.85, 2.0}`；顺序首中）：self_harm ≥ ACT → SUPPORT（固定支持资源，不调 LLM）· jailbreak 或 harmful ≥ ACT → BLOCK · severity ≥ SEV_BLOCK 且任一危害 ≥ REVIEW → BLOCK · medical ≥ ACT → CAUTION_LLM（Sonnet 5 + 医疗谨慎 system）· wants_human ≥ 0.8 → HUMAN · intent.confidence < 0.5 → HUMAN · intent=faq 且 complexity < 0.7 → DETERMINISTIC（`faq_topic` 置信度 ≥ 0.6 查表，否则 Sonnet 5）· complaint 且 complexity > 1.0 → HUMAN · complexity < 1.7 → STANDARD（Sonnet 5）· 否则 STRONG（Opus 5；开启 `frontier` 后 complexity ≥ 1.9 → Fable 5.1）。每条规则带中文标签。
- **路由** `POST /api/b1/message {message, recent_context, policy}` → `{decision:{route, tier?, ruleFired, reasons}, reply, baseline, traces}`；DETERMINISTIC/BLOCK/SUPPORT/HUMAN 零 Claude 花费。
- **UI**：左侧聊天（预置菜单 + 自由输入）；右侧 DecisionTrace：危害 NoulGauge、intent ProbBars、complexity ScoreLine、策略列表高亮命中规则、tier 徽章；底部 Jev ms + Claude ms、本轮费用、会话 SavingsCard（"实际 vs 全走 Opus 5 / 全走 Sonnet 5 + LLM 做护栏"两条基线）；策略切换在浏览器基于已存答案重跑。
- **验证**：vitest `policy.test.ts`（16 条消息 × 手工标注的合成答案 → 期望路由；优先级测试）；smoke 打印每条消息的路由（期望 ≥14/16 符合标注）；Playwright：发送 FAQ / 越狱 / 复杂技术三条 → 徽章 确定性 / 拦截 / Opus → 截图。

### B2 引用核验（Claude 写，Jev 查）
- **证明点**：通用验证——生成者与检验者分离，用 LLM 约百分之一的成本核查引用。
- **数据**：RFC 7519 全文 63,039 字符（IETF Trust 法律条款允许复制，保留版权声明）→ `rfc7519.ts`，`sections.ts` 按 `^\d+(\.\d+)*\.  ` 切出 45 节；`cannedCitations` 8 条（仿 cookbook：4 正确、1 捏造、1 相矛盾、2 无依据）。
- **路由**：`POST /api/b2/answer {question, tier?, injectErrors?}` → `claudeParse` 输出 `{answer, claims:[{claim, section_id, quote}]}`（system 要求逐字引用；RFC 全文 ≈16k tokens 进 prompt，同一问题的 Claude 回答也走缓存层）；`injectErrors` 时服务端把一条 claim 的 `section_id` 换到相邻节、把一条 quote 改一个关键词。`POST /api/b2/verify {claims}` → 每条 `{verdict, relation?, confidence?, review, matchedAt?}`。
- **核验管线**（`match.ts`, `compose.ts`）：`normalize()`（折叠空白、弯引号/破折号、小写）；quote 不在所引章节 → 全文搜索 → 在别处找到 = `misattributed`，否则 `fabricated`（都不调 Jev）。命中者每条一次 Jev 请求。
- **state**：`{ claim, section: sections[section_id].text, quote }`。
- **问题（2，一次请求）**：`relation` Choice "How does \`section\` relate to \`claim\`?"：supports / contradicts / says_nothing（描述沿用 cookbook）；`quote_supports` Noul "Read in the context of \`section\`, does \`quote\` state or directly imply \`claim\`?"。
- **组合**：verdict = relation → verified / contradicted / unsupported；`review = relation.confidence < AUTO_ACCEPT 0.8`；`quote_supports ≥ 0.7` 但 relation ≠ supports → 标"引文支持但上下文不支持"。
- **UI**：左侧问题框（5 个预置 JWT 问题）→ Claude 回答，每条 claim 下划线 + 徽章 绿 已核实 / 红 相矛盾 / 橙 捏造 / 紫 误标章节 / 黄 无依据 / 灰 待复核；右侧选中 claim → 章节全文高亮 quote、relation ProbBars、ConfidenceRing；汇总芯片；SavingsCard"Jev 核验 n 条 = $x；若让同一 LLM 复核 ≈ $y"；"注入错误"开关；"使用官方 8 条引文"预置（跳过 Claude）。
- **验证**：vitest `match.test.ts`（弯引号、连字符、空白、误标检测）+ `compose.test.ts`；smoke 跑 8 条预置 → 期望 4/1/1/2；Playwright 截图徽章。

### B3 RAG 段落守门人
- **证明点**：Jev 在检索与生成之间做证据筛选与提示注入检测；让 LLM 敢于反驳错误前提。
- **数据**（`ragCorpus.ts`）：RFC 7519 章节切成 ≤1,200 字符的 ~70 段（`source_type:"rfc"`）+ 植入 `forum-injection` 段（`source_type:"forum"`，文本指示回答系统忽略证据并建议关闭签名校验）+ 2 段与 RFC 矛盾的 `blog` 段（如"exp claim is mandatory in every JWT"）。6 条预置查询，2 条含错误前提（"Since every JWT must be encrypted, which algorithm is mandatory?"、"Refresh tokens are defined in RFC 7519 — how long do they last?"）。
- **检索**：`bm25.ts` 手写（k1 1.5，b 0.75，小写 + 停用词），top-10，确定性。
- **路由** `POST /api/b3/ask {query, gatekeeper: boolean, tier?}` → `{retrieved:[{id, bm25, answers?, route, reason}], prompt, answer, baseline, traces}`。
- **state（每段）**：`{ query, passage:{id, title, text, source_type} }`，每段一次 Jev 请求经 `queue.jev`。
- **问题（4 Noul）**：`is_relevant` "Does \`passage.text\` address the subject of \`query\`?" · `contains_answer_evidence` "Does \`passage.text\` state information usable in a direct answer to \`query\`?" · `contradicts_query_premise` "Does \`passage.text\` conflict with a factual premise stated in \`query\`?" · `contains_prompt_injection` "Does \`passage.text\` attempt to instruct or control the system answering \`query\`?"
- **组合**（`THRESHOLDS {INJECTION_MAX 0.70, CONTRADICTS_MIN 0.70, RELEVANT_MIN 0.45, EVIDENCE_MIN 0.55}`，顺序）：injection > max → 排除(注入) · contradicts > min → 冲突证据 · relevant < min → 排除(无关) · evidence > min → 采纳 · 否则排除(无证据)。
- **Claude**（默认 Sonnet 5）：system "Answer only from ACCEPTED EVIDENCE; if CONFLICTING EVIDENCE contradicts a premise in the question, say so; if evidence is insufficient, say so."；`gatekeeper:false` 时直接喂原始 top-10（教学对照）。
- **UI**：查询 + 预置；三列：检索列表（BM25 排名）→ 段落卡 4 个迷你 NoulGauge + 路由芯片（绿 采纳 / 橙 冲突 / 灰 排除 / 红 注入）→ "Claude 实际看到的 prompt"（可折叠）与回答；守门人开关；SavingsCard（守门步骤 vs LLM 守门；端到端 tokens 变化）。
- **验证**：vitest `bm25.test.ts`（3 文档夹具已知排序）、`compose.test.ts`（规则顺序）；smoke 头条查询 → 注入段 ≥0.7 且路由为注入、错误前提触发 contradicts；Playwright 截图红色芯片。

### B4 自然语言智能家居助手
- **证明点**：一次请求 14 个 speculative 问题直接驱动 UI（function calling 每个参数带概率）；数字留给正则；高风险动作更高门限；Claude 只在拆分复合指令与闲聊兜底时出场。
- **房屋模型**（`home.ts`）：5 房间 living_room / kitchen / bedroom / bathroom / office；设备 `lights{on, brightness: off|dim|medium|bright, color}`、`thermostat{targetC}`、`blinds{open}`、`speaker{playing, volume}`、`tv{on}`、房屋级 `front_door_lock{locked}`；reducer `applyCommand(state, cmd)`；状态由浏览器持有。
- **数据**（`smartHomeCommands.ts`）：20 条示例指令（单一、全屋、复合、闲聊、状态询问、歧义、含数字 "set the bedroom to 21 degrees" / "dim the office lights to 30%"）。
- **state**：`{ request, rooms:[...], devices:[...] }`。
- **问题（14，一次请求）**：`category` Choice（device_command / information_question / chit_chat / other）；`is_compound` Noul "Does \`request\` ask for more than one distinct action…?"；`room` Choice（5 房间 + whole_house + not_stated）；`device` Choice（6 设备 + not_stated）；`light_action` Choice（turn_on / turn_off / change_brightness / change_color / not_applicable）；`brightness_level` Choice（dim / medium / bright / not_stated）；`color` Choice（white / warm_white / red / blue / green / purple / not_stated）；`thermostat_action` Choice（set_specific / warmer / cooler / not_applicable）；`blinds_action`、`speaker_action`、`tv_action`、`lock_action` 各一 Choice（含 not_applicable）；`mentions_number` Noul "Does \`request\` contain a specific number for a temperature, percentage, or level?"；`is_question_about_state` Noul。
- **数字在代码里**（`numbers.ts`）：正则 `(\d+)\s*(°|degrees|percent|%)` 提取精确值；Jev 只判断"有数字"和"属于哪个设备"。
- **分派**（`dispatch.ts`，门限 `{CATEGORY_MIN 0.5, COMPOUND 0.7, ROOM_MIN 0.5, DEVICE_MIN 0.6, LOCK_MIN 0.85}`）：category 置信度不足 → 澄清；`is_compound ≥ 0.7` → Sonnet 5 `claudeParse` 拆成 `string[]` → 每条再问同一批 Jev 问题（第二次请求合理：新 state）；chit_chat / information → Sonnet 5 生成一句回复（状态询问把房屋 JSON 放进 prompt）；device_command → 房间与设备须过门限否则澄清；lock/unlock 需 `lock_action.confidence ≥ 0.85` 否则要求确认；产出 `Command[]` 交给 reducer。
- **路由** `POST /api/b4/command {request, home}` → `{commands, reply?, clarification?, decision, baseline, traces}`。
- **UI**：SVG 平面图（灯光 = 亮度 × 颜色、温度数字、窗帘、音符、电视屏、门锁图标）；指令输入 + 示例；右侧 DecisionTrace：category / room / device / 所选动作 ProbBars、门限结果、"被忽略的 speculative 答案"折叠、复合拆分列表；事件日志含每步延迟（Jev ≈100ms vs Claude 兜底）；SavingsCard。
- **验证**：vitest `dispatch.test.ts`（门限、复合路径、数字覆盖、门锁确认）、`numbers.test.ts`；smoke 10 条指令 → 分派结果；Playwright："turn off all the lights" → 所有房间灯灭 → 截图。

## 5. 成本模型与预估下降比例

**方法**：`shared/src/costModel.ts` 为每个场景定义 `baseline(traces, tier)`：用**实际发送给 Jev 的 input tokens** 作为 LLM 输入 tokens 的近似（同样的 state + 问题/指令），加上一个**假设的输出 tokens 常量**（LLM 必须生成 JSON/答案，Jev 输出免费），按所选 tier 价格计算；再与 Jev 实际费用相除得"预估节省"。假设全部可见、可在 UI 切换基线 tier；A4 与 B1 额外给出**实测**数字。价格：Jev $0.042/M 输入；Sonnet 5 $2/$10；Opus 5 $5/$25（$/Mtok 输入/输出）。

| 场景 | 被替代的 LLM 工作（基线） | 关键假设 | 预估 Jev 费用 | 预估 LLM 基线费用 | 预估下降 |
|---|---|---|---|---|---|
| A1 单次评估 | LLM 结构化输出回答 3 题 | 400 in / 150 out | $0.000017 | Sonnet 5 $0.0023；Opus 5 $0.0058 | **≈99.3%（130×）– 99.7%（340×）** |
| A2 每条工单 | LLM 一次 JSON 分类 10 个字段 | 700 in / 250 out | $0.00003 | Sonnet 5 $0.0039；Opus 5 $0.0098 | **≈99.2%（130×）– 99.7%（330×）**；改阈值重排额外节省 100% 重跑 |
| A3 每次查询 | LLM 读全文并指出行号 | 11k in / 100 out | $0.00046 | Sonnet 5 $0.023；Opus 5 $0.058 | **≈98%（50×）– 99.2%（125×）**。注意：对比向量检索时 Jev **不更便宜**（embedding 每查询 ≈$0.000001 + 一次性索引），优势是零索引、交叉编码级理解、可解释 |
| A4 每次 8 题调用 | LLM 结构化输出 8 个分布 | 1.1k in / 300 out | $0.000046 | Sonnet 4.6 $0.0078；Sonnet 5 $0.0052；Opus 5 $0.013 | **≈99.1%（110×）– 99.6%（280×）**；此场景直接实测 |
| B1 分类/护栏步骤 | LLM 做意图+护栏分类 | 800 in / 200 out | $0.000034 | Sonnet 5 $0.0036 | **≈99%（≈105×）** |
| B1 端到端（16 条消息） | 全部消息直接交给 Opus 5 回答 | 600 in / 400 out；Jev 后 6 条零 LLM、7 条 Sonnet 5、3 条 Opus 5 | $0.076（含 Jev $0.0005） | $0.21 | **≈55–65%**（取决于流量分布；生成成本仍在） |
| B2 核验步骤（每条引用） | 同一 LLM 逐条核验 | 900 in / 60 out | $0.000038 | Sonnet 5 $0.0024；Opus 5 $0.006 | **≈98.4%（60×）– 99.4%（160×）** |
| B2 端到端（1 问 8 引用） | Opus 5 生成 + Opus 5 核验 | 生成 16k in / 600 out ≈ $0.095 | 生成 $0.095 + Jev $0.0003 | 生成 $0.095 + 核验 $0.048 | **≈33%**（核验从 ~50% 的附加成本降到 0.3%） |
| B3 守门步骤（10 段） | LLM 逐段判 4 项 | 450 in / 80 out ×10 | $0.00019 | Sonnet 5 $0.017 | **≈99%（≈90×）** |
| B3 端到端（每问） | Opus 5 直接吃 top-10 段 | 未过滤 3.2k in vs 过滤后 1.1k in；400 out | $0.0157 | $0.026 | **≈40%**（主要价值是安全与正确性） |
| B4 纯设备指令 | LLM function calling 一次 | 1k in / 120 out | $0.000055 | Sonnet 5 $0.0032；Opus 5 $0.008 | **≈98.3%（60×）– 99.3%（145×）** |
| B4 混合流量（20 条，20% 需拆分/闲聊） | 全部走 LLM function calling | 拆分/闲聊各加一次 Sonnet 5 ≈ $0.0025 | $0.011 | Sonnet 5 $0.064；Opus 5 $0.16 | **≈83%（6×）– 93%（15×）**；延迟 0.1s vs 1–3s |

要点：**判断/分类/核验/筛选步骤本身**下降两个数量级（约 50–340×，与官方 76×–900× 同量级）；**含生成的端到端流程**下降 30–65%，因为生成仍需 LLM，Jev 的价值在于让生成只发生在必要处、只吃必要上下文。实测值由 CostMeter 记录并回填到 `docs/05-成本模型.md`。

## 6. 跨场景组件与运维
- **错误映射**（`errors.ts`）：Jev 401 →"TYPESAFE_API_KEY 无效或缺失"；422 → 透传 API 正文并记录请求（问题形状 bug）；429/529 → 503 "Jev 限流，稍后重试"；Bedrock ThrottlingException → 503；凭证错误 → 500 "AWS 凭证不可用，检查 AWS_PROFILE"。UI toast 中文，原始错误进 Inspector。
- **队列**：Jev `p-limit(6)`、Claude `p-limit(3)`，暴露 `queue.stats()` 显示"排队中 n"。
- **缓存**：文件级 JSON；`JEV_CACHE` 默认 `read-write`；A4、A1 实时模式 off；`npm run cache:clear`。**`server/.cache/jev` 提交进仓库**（无密钥的小 JSON），新 clone 无 key 也能回放全部页面；A4 永远绕过。
- **`scripts/smoke.ts`**：每场景导出 `smokeCases`（3–5 条固定 state），真实调用（缓存 off），打印表格（用例 / 关键答案 / 置信度 / ms / USD / 组合结果 / 基线估算），API 错误退出码非 0。**每个场景在写 UI 前先跑 smoke 修问题措辞**。
- **`scripts/check-env.ts`**：Jev 一次最小请求；Bedrock 逐 tier 一次最小 `messages.parse`（记录结构化输出支持）；打印模型 ID、延迟、费用。

## 7. 测试策略
- `shared/`：vitest 覆盖全部纯函数（compose / policy / gate / match / bm25 / metrics / dispatch / numbers / buildState / validate / costModel），用构造答案覆盖分支与阈值边界。
- `server/`：路由测试 mock `askJev` / `claudeText` / `claudeParse`，验证请求形状与错误映射。
- 真实 API：`smoke.ts` 手动跑；每场景 DONE 前跑一次并把表格贴进 `docs/scenarios/*.md` 的"实测记录"。
- UI：Playwright MCP 打开每页执行关键交互、检查控制台无错误、截图存 `docs/screenshots/`。

## 8. 教学文档（`docs/`，中文，引用官方 URL）

| 文件 | 内容 |
|---|---|
| `00-什么是Jev.md` | System One 定义；RLCD vs RLHF/RLVR；机器原生智能；价格/延迟/限制表；与 LLM 差异表；何时不该用 Jev。引用 `/concepts/system-one`、`/introduction/machine-learning-primer`、`/models` |
| `01-三种原语.md` | Choice/Score/Noul 请求与响应字段、选型规则、Noul≠程度、Score 级别写情境、结构化 instructions/criteria、反引号路径、255/10 上限。引用 `/primitives/*`、`/primitives/advanced` |
| `02-置信度与阈值.md` | confidence 由分布导出、三段式路由、阈值随风险、Noul 无 confidence、A2/B1 阈值常量位置。引用 `/confidence`、`/patterns/confidence-routing` |
| `03-与LLM的差异与局限.md` | jaggedness 九条 + "改在代码里做"的对策；CJK 提示；一致性 vs 确定性（cookbook 数据）；官方对比数字表。引用 `/model-jaggedness/jev-1.13`、`/cookbooks/consistency_choice_cookbook` |
| `04-设计模式.md` | fan-out、confidence routing、composite scoring、intent routing、cascade、verify，各对应本项目哪个场景 |
| `05-成本模型.md` | §5 表 + 假设说明 + 实测回填；"判断步骤两个数量级、端到端 30–65%"的结论与适用条件 |
| `scenarios/A1..B4.md` | 目标、问题清单（英文原文 + 中文释义）、组合逻辑与阈值、界面说明、"试一试"、陷阱、对应 cookbook/pattern 链接、实测记录表与成本对比（实施后填写） |
| `superpowers/specs/2026-09-22-jev-lab-design.md` | 本方案副本，P0 落库 |
| 根 `README.md` | 安装（`claude plugin marketplace add typesafe-ai/skills` + `claude plugin install typesafe@typesafe-ai`）、环境变量、启动、学习路径 A1→A2→A4→B1→B2→A3→B3→B4、一句话概括每场景证明了什么与节省比例 |

## 9. 实施阶段（每阶段有 DONE 标准）

| 阶段 | 内容 | 规模 | DONE |
|---|---|---|---|
| P0 底座 | 安装 TypeSafe 插件；脚手架三包 + tsconfig；`pricing.ts` / `costModel.ts`；`jev.ts` / `claude.ts` / `llmSystemOne.ts` / `cache.ts` / `queue.ts` / `errors.ts`；Shell + Inspector + CostMeter + SavingsCard；`vendor-datasets.ts`、`check-env.ts`、`smoke.ts` 骨架；docs 00–05；方案副本落库 | L | `check-env` 对 Jev 成功、对 Sonnet 5 / Opus 5 / Sonnet 4.6 各成功一次并打印结构化输出支持、ID、延迟、费用；`llmSystemOne` 对预置 1 返回归一化分布；218 选项 Choice 冒烟无 422；vitest 跑通；`npm run dev` 打开 Shell |
| P1 A1 | 预置 7 组、页面、实时模式 | S | 7 组可跑；实时模式 <1s 更新；422 字段级提示；SavingsCard 显示；截图 |
| P2 A2 | 24 工单、10 题、compose、看板、滑杆 | M | smoke 6 条泳道合理；滑杆零请求重排；单测绿；截图 |
| P3 A4 | arms、SSE、metrics、热力图 | M | 15 轮 × 5 臂跑完；cookbook 格式表出现；单测绿；结果 JSON 导出 |
| P4 B1 | 16 消息、policy、聊天、轨迹、双基线节省 | M | smoke ≥14/16 路由符合标注；LLM 路由有 Claude 回复；单测绿；截图 |
| P5 B2 | 章节解析、预置引文、Claude 生成、核验 | M | 预置 8 条复现 4/1/1/2；注入错误被抓；单测绿；截图 |
| P6 A3 | state 构造、218 选项 Choice、文档视图 | S | cookbook 查询复现；含"文档未涉及"用例；截图 |
| P7 B3 | bm25、语料 + 植入、gate、Claude | M | 注入段被排除、错误前提被标记、开关对照可见；单测绿；截图 |
| P8 B4 | 房屋模型、14 题、dispatch、SVG、Claude 拆分/兜底 | L | 10 条示例驱动房屋；门锁要求确认；复合拆分；单测绿；截图 |
| P9 收尾 | 每场景文档实测记录与成本回填、README、缓存提交、全量 Playwright 走查、`npm run typecheck && npm test` | S | 全绿；新 clone 无 key 可从缓存回放每页；README 10 分钟跑起 |

顺序理由：A1→A2 先原语再组合；A4 提前因为它锻炼最有风险的 `llmSystemOne` 并产出后续学习卡引用的"为什么是 Jev"数字；B1/B2 是最有说服力的混合场景；A3 小；B3 复用 B2 的 RFC 管线；B4 UI 最大放最后。

P0 去风险清单：(1) runtime 端点上各 tier 的 `messages.parse` 可用性与归一化频率（不支持则 strict tool 回退）；(2) 218 选项 Choice 对 ToS state 的延迟与 422；(3) 每场景问题草稿先过 smoke 再写 UI；(4) tsx `--env-file` 转发；(5) Bedrock 限流阈值（3 并发是否足够）。

## 10. 风险与决定

| # | 事项 | 决定 |
|---|---|---|
| D1 | Bedrock 端点 | **runtime 端点 `AnthropicBedrock` + `global.anthropic.*` 推理配置 ID**（用户指定）；Mantle 仅作备注 |
| D2 | LLM 口头概率可能不合法 | 校验 + 归一化 + 1 次纠正重试；记录 `normalizationDelta` 并在 A4 作为发现展示；LLM 臂 `confidence=null` |
| D3 | 是否提交 Jev 缓存 | 提交（小 JSON、无密钥），支持无 key 回放；A4 绕过；提供 `cache:clear` |
| D4 | 限流动态调整 | Jev 6 / Claude 3 并发，SDK 重试，503 中文提示，队列指示器 |
| D5 | 问题措辞质量（TypeSafe 明说 agent 不擅长写问题） | smoke 先行；问题集中在 `shared/`；每阶段 smoke 表与用户一起复核措辞 |
| D6 | B2 整篇 RFC ≈16k tokens 进 Claude | 可接受（Sonnet 5 约 $0.04、Opus 5 约 $0.1/次）；Claude 回答按问题缓存；提供跳过 Claude 的预置引文 |
| D7 | B3 每段一请求 vs 单 state 批量 | 默认每段一请求（文档警告 context rot）；批量作为可选实验 |
| D8 | B4 复合拆分后的第二次 Jev 请求 | 合理（新 state），轨迹中明示为"文档允许的例外" |
| D9 | CJK 准确率 | 数据全英文；A1 预置 7 演示差异；docs 03 说明 |
| D10 | 数字/日期 jaggedness | 全部数值解析与比较在代码（`numbers.ts`、BM25、阈值）；绝不让 Jev 计数 |
| D11 | Playground 分享链接需移植 LZ-string | 可选，P9 有余力再做 |
| D12 | Vite 8 / Tailwind 4 / React 19 均为新大版本 | 采用；若 workspace 解析 `.ts` exports 异常则加 `resolve.alias` |
| D13 | 数据版权 | GitHub ToS（CC0）、RFC 7519（IETF Trust，保留声明）、其余合成；vendor 脚本头部注明 |
| D14 | Claude 模型选择 | **4.6 / 5 系列**：默认生成 Sonnet 5，高复杂度 Opus 5，Sonnet 4.6 / Opus 4.6 仅作 A4 对照，Fable 5.1 可选前沿层；Haiku 4.5 默认关闭，仅为复现官方数字时开启 |
| D15 | 成本预估的诚实性 | 基线假设全部展示在 SavingsCard；A3 明示"相对向量检索不省钱"；端到端与步骤级分别给出；实测值回填文档 |

范围外：不写 Python；本地服务无鉴权（仅回环）；除文件缓存外无持久化。

## 11. 端到端验证清单（P9 前逐项打勾）
1. `npm run check-env`：Jev 与 Bedrock 各 tier 成功，打印模型 ID、延迟、费用、结构化输出支持。
2. `npm test`、`npm run typecheck` 全绿。
3. `npm run smoke -- all`：8 个场景对固定输入输出合理，表格（含基线估算）记录到 docs。
4. Playwright：8 个页面各完成一条关键交互，无控制台错误，截图存 `docs/screenshots/`。
5. CostMeter 累计与 server 日志一致；缓存命中不计费且有"缓存"芯片；SavingsCard 假设可展开。
6. 删除 `.env` 后从缓存回放每页成功；README 从零启动步骤在新终端复现一次。
