# Jev Lab · TypeSafe Jev 可视化案例

**Jev** 是 TypeSafe 公司的 System One 模型：它读懂自然语言，但不生成文字，只回答你定义好的类型化问题（Choice / Score / Noul），约 100 毫秒返回校准过的概率与置信度，输入 $0.042/Mtok、输出免费。代码掌控流程，Jev 只在需要"常识判断"的节点给出一个可阈值化、可排序、可组合的数字。

本仓库是一套学习材料 + 可运行的 Web 应用：多个场景按学习路径排列，每个场景都展示**发给 Jev 的原始问题、返回的概率、延迟与费用**，以及"如果用 LLM 做同样的事"的成本基线；其中一部分场景把 Jev 与 Claude（经 AWS Bedrock）组合使用。

## 快速开始

```bash
npm install
cp .env.example .env          # 填入 TYPESAFE_API_KEY（https://console.typesafe.ai/keys）
                              # Claude 走 AWS Bedrock：AWS_PROFILE / AWS_REGION 已有默认值
npm run check-env             # 探测 Jev 与 Bedrock 各层级，打印延迟与费用
npm run dev                   # 后端 http://localhost:8787 + 前端 http://localhost:5173
npm run smoke -- p0           # 用真实 API 跑一次三原语示例（场景名 a1…c5 同理）
npm test                      # vitest（shared + server）
```

后端换了端口时，用 `API_PROXY_TARGET=http://127.0.0.1:8788 npm run dev -w @jev/web` 让 Vite 代理指过去。

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
| 9 | **C1 作业按细则评分**（教育） ✔ | 行业判断：细则 Noul + 情境 Score，内容与表达分开，低置信度交老师；Claude 反馈由 Jev 核验 | 评分步骤实测 99×（99.0%）；含反馈端到端 ≈ 66% |
| 10 | **C2 患者留言分诊**（医疗） ✔ | 行业判断：分诊可以，诊断不行；红旗硬规则，化验值由代码比较，明示不问 Jev 的问题 | 分诊步骤实测 94×（98.9%）；16/16 泳道命中 |
| 11 | **C3 公告重大性判断**（金融） ✔ | 行业判断：判断文字不判断价格；事件类型 + 重大性 Score 排成待阅列表，明示不问买卖 | 判定步骤实测 87×（98.9%）；15/15 事件类型；15/15 泳道（同批数据调门限后） |
| 12 | **C4 VPP 调度通知与告警**（能源） ✔ | 行业判断：通知 × 站点逐对判断适用性、是否要求行动、是否测试、告警类别；kW / 百分比 / 时间窗由代码解析比较 | 判定步骤实测 79×（98.7%）；36/36 路由（9 题，含防泄漏的 addressed_to_one_site） |
| 13 | **C5 语义音乐盒**（创作） ✔ | 新方向：Jev 不生成音频，只给程序化创作提供语义控制信号；一次请求 7 题（音色 Choice、能量 / 明亮度 / 密度 / 张力 Score、鼓点 / 静音 Noul），浏览器用确定性四小节音序 + Web Audio 合成；手动混音、变奏、WAV 导出零推理 | 参数判断步骤实测 88×（98.9%）；只比 7 个参数的 JSON 输出，不与音频生成模型虚比 |

表中的倍数与百分比都只算"判断步骤"或注明的端到端流程。三个横向专题：

- **成本模型**（[`docs/05-成本模型.md`](docs/05-成本模型.md)）：LLM 基线用 Jev 实际收到的输入 tokens，加每个场景假设的输出 tokens，按 Claude 公开价计算。判断 / 分类 / 核验 / 筛选步骤实测便宜 **50–635×**：A3 每次要读 12k tokens，只有 50×；A4 只读 1.1k，对 Opus 5 达到 635×。倍数主要由每次要读的上下文长度决定。含生成的端到端流程实测省 **29%（B2）/ 47%（B3）/ 85%（B4）/ 87%（B1）**，因为生成仍要 LLM，Jev 只是让生成发生在必要处。Jev 不占优的地方：相对向量检索贵约三个数量级，也永远不如确定性代码（正则、字符串匹配都放在 Jev 之前）。
- **行业场景适用性**（[`docs/06-行业场景适用性.md`](docs/06-行业场景适用性.md)）：只有一条判断标准，"细心读者只凭这段文字、用常识就能下的类型化判断"。判断分三类：文字说了什么，交给 Jev；专业多步推理，Jev 弱；数字 / 物理 / 时间 / 感知，Jev 不能做。按这三类拆解了教育、医疗、金融、能源 VPP、自动驾驶五个行业，对应 C1–C4。另有三条实践规则：进高风险领域前先量准确率；门限附近会漂移，要留灰区给人；代码先行。
- **Jev 与 Laya**（[`docs/08-Jev与Laya对比.md`](docs/08-Jev与Laya对比.md)）：[Laya](https://huggingface.co/convaiinnovations/laya) 是开放权重（Apache 2.0）的同类模型，`laya-serve` 提供与 Jev 同形的 `/v1/systemone`。它的优势在部署属性：快、零边际成本、数据不出机器、可微调。它的代价在零样本质量，而且上下文与选项预算只有 512 / 192 tokens。按预算筛过 12 个场景后，选 B4 作为第一个试点。在 g4dn.xlarge（T4）上实测：原样转发只命中 **3 / 20**，因为 Laya 忽略对象 state，它的 `confidence` 也不是 Jev 的含义；改用纯文本 state、把 Noul 改成两选项 Choice、按 `answer_confidence` 过门限后 **12 / 20**（Jev 20 / 20）。开锁始终要求确认，14 题一次请求在实例内 p50 **88 ms**。第三方 JevBench v1.3.0 的总分是 Jev 74.4、Laya 54.4。回放脚本：`scripts/laya-replay.ts`。

## 部署到 AWS

在线演示：**https://dsctx8euz6le2.cloudfront.net** （公网模式，见下；需要登录，账号由管理员分配）。

`infra/` 是一个 CDK 栈：S3（私有桶 + OAC）放前端，API Gateway（HTTP API）+ Lambda 跑 Hono 后端，同一个 CloudFront 分发对外。站点和 `/api/*` 都要先经 Cognito 登录（Lambda@Edge，见 [aws-is-how/security/site-auth](https://github.com/liangruibupt/aws-is-how/tree/master/security/site-auth)）；公网模式下 A4 真实实验和花费计数重置关闭、每实例花费上限 $5、直连 API Gateway 会因缺少 CloudFront 注入的校验头而 403。步骤与取舍见 `docs/07-部署.md`：

```bash
echo "ORIGIN_VERIFY_SECRET=$(openssl rand -hex 24)" >> .env
set -a; source .env; set +a
AWS_PROFILE=global_ruiliang npm run deploy      # vite build + cdk deploy
```

## 截图

所有图片在 `docs/screenshots/`。

<table>
  <tr><td align="center" valign="top"><img src="docs/screenshots/home.png" width="420" alt="首页总览（截于前 8 个场景完成时）"><br><sub>首页总览（截于前 8 个场景完成时）</sub></td><td align="center" valign="top"><img src="docs/screenshots/p0-shell.png" width="420" alt="P0 阶段的应用外壳（当时 8 个场景都还在规划中）"><br><sub>P0 阶段的应用外壳（当时 8 个场景都还在规划中）</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/a1-quickstart.png" width="420" alt="A1 原语实验室：三原语的概率分布、延迟与费用"><br><sub>A1 原语实验室：三原语的概率分布、延迟与费用</sub></td><td align="center" valign="top"><img src="docs/screenshots/a1-counting.png" width="420" alt="A1 数数：逐项问 Noul，由代码求和"><br><sub>A1 数数：逐项问 Noul，由代码求和</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/a2-board.png" width="420" alt="A2 工单分流看板：10 题一次请求，按置信度分泳道"><br><sub>A2 工单分流看板：10 题一次请求，按置信度分泳道</sub></td><td align="center" valign="top"><img src="docs/screenshots/a2-sliders.png" width="420" alt="A2 阈值滑杆：改门限即重排，零推理"><br><sub>A2 阈值滑杆：改门限即重排，零推理</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/a3-find.png" width="420" alt="A3 逐行语义搜索：218 行 Choice 定位答案所在行"><br><sub>A3 逐行语义搜索：218 行 Choice 定位答案所在行</sub></td><td align="center" valign="top"><img src="docs/screenshots/a3-absent.png" width="420" alt="A3 存在性 Noul：判定文档未涉及"><br><sub>A3 存在性 Noul：判定文档未涉及</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/a4-heatmap.png" width="420" alt="A4 一致性与校准：Jev vs Claude 重复 15 轮的热力图"><br><sub>A4 一致性与校准：Jev vs Claude 重复 15 轮的热力图</sub></td><td align="center" valign="top"><img src="docs/screenshots/b1-router.png" width="420" alt="B1 护栏 + 路由：拦截 / 人工 / Sonnet / Opus"><br><sub>B1 护栏 + 路由：拦截 / 人工 / Sonnet / Opus</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/b2-citations.png" width="420" alt="B2 引用核验：Claude 带引用作答，Jev 逐条核验"><br><sub>B2 引用核验：Claude 带引用作答，Jev 逐条核验</sub></td><td align="center" valign="top"><img src="docs/screenshots/b3-gatekeeper.png" width="420" alt="B3 RAG 守门：四个 Noul 筛证据、拦注入"><br><sub>B3 RAG 守门：四个 Noul 筛证据、拦注入</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/b3-ungated.png" width="420" alt="B3 对照：不守门直接把 top-10 交给 Claude"><br><sub>B3 对照：不守门直接把 top-10 交给 Claude</sub></td><td align="center" valign="top"><img src="docs/screenshots/b3-false-premise.png" width="420" alt="B3 错误前提：证据不支持时 Claude 敢于反驳"><br><sub>B3 错误前提：证据不支持时 Claude 敢于反驳</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/b4-home.png" width="420" alt="B4 智能家居：14 个 speculative 问题驱动虚拟房屋"><br><sub>B4 智能家居：14 个 speculative 问题驱动虚拟房屋</sub></td><td align="center" valign="top"><img src="docs/screenshots/c1-grading.png" width="420" alt="C1 作业评分：细则 Noul + 情境 Score，低置信度交老师"><br><sub>C1 作业评分：细则 Noul + 情境 Score，低置信度交老师</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/c2-triage.png" width="420" alt="C2 患者留言分诊：紧急度 + 红旗 + 科室"><br><sub>C2 患者留言分诊：紧急度 + 红旗 + 科室</sub></td><td align="center" valign="top"><img src="docs/screenshots/c3-filings.png" width="420" alt="C3 公告重大性：事件类型 + 重大性 Score 排成待阅列表"><br><sub>C3 公告重大性：事件类型 + 重大性 Score 排成待阅列表</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/c4-vpp.png" width="420" alt="C4 VPP：通知 × 站点逐对判断适用性"><br><sub>C4 VPP：通知 × 站点逐对判断适用性</sub></td><td align="center" valign="top"><img src="docs/screenshots/c5-sound-studio.png" width="420" alt="C5 语义音乐盒：雨夜车窗 → 暖弦 62 BPM、无鼓点"><br><sub>C5 语义音乐盒：雨夜车窗 → 暖弦 62 BPM、无鼓点</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/c5-sound-run.png" width="420" alt="C5 语义音乐盒：夜跑脉冲 → 拨弦 124 BPM、开鼓点"><br><sub>C5 语义音乐盒：夜跑脉冲 → 拨弦 124 BPM、开鼓点</sub></td><td align="center" valign="top"><img src="docs/screenshots/c5-sound-mobile.png" width="160" alt="C5 手机布局"><br><sub>C5 手机布局</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/screenshots/cloud-c2.png" width="420" alt="公网 CloudFront 部署上的 C2"><br><sub>公网 CloudFront 部署上的 C2</sub></td></tr>
</table>

## 文档与目录

```
shared/   问题、阈值、权重、成本模型、数据集：唯一的"可审阅处"，前后端共用
server/   Hono API；唯一持有密钥的进程；封装 Jev（缓存 / 限流 / 计费）与 Claude（Bedrock runtime）
          server/.cache/jev/ 是提交到仓库的 Jev 响应缓存
web/      Vite + React 前端：场景页面、请求检视器、费用仪表、成本对比卡
infra/    CDK 栈：S3 + CloudFront + API Gateway + Lambda，Cognito 登录（见 docs/07）
scripts/  check-env（环境探测）· smoke 与 smokes/（每个场景的真实 API 冒烟）· latency-probe · warm-cache
          vendor-datasets（下载公开数据集）· a4-merge-results · verify-c5-browser · laya-replay（Jev vs Laya 回放）
docs/
  00-什么是Jev.md           System One 是什么、能做和不能做什么
  01-三种原语.md            Choice / Score / Noul 的形状与用法
  02-置信度与阈值.md        概率、置信度与门限怎么定
  03-与LLM的差异与局限.md   jaggedness：字面理解、算数、日期、多跳、context rot……
  04-设计模式.md            speculative fan-out、置信度路由、判断即数据、代码先行
  05-成本模型.md            LLM 基线的估算方法、预估表与全部实测回填
  06-行业场景适用性.md      哪些行业判断能交给 Jev，五个行业的拆解
  07-部署.md                AWS 部署步骤、公网模式与取舍
  08-Jev与Laya对比.md       开源 Laya 的对比、场景筛选、B4 实测
  scenarios/               每个场景（A1–C5）的问题清单、组合逻辑、实测记录；README 是索引
  results/                 A4 实验、C5 浏览器验证、Laya 回放的原始结果 JSON
  screenshots/             上面的截图
  examples/                c5-rain.wav：浏览器合成的 C5 示例音频
  superpowers/             设计稿 specs/2026-09-22-jev-lab-design.md 与实施计划 plans/
```

## 约定

- 演示数据为英文（Jev 英文准确率最高），界面与文档为中文。
- Claude 经 AWS Bedrock runtime 调用，模型层级与价格集中在 `shared/src/pricing.ts`（Sonnet 5 / Opus 5 为主，Sonnet 4.6 / Opus 4.6 作对照，Fable 5.1 可选）。
- `server/.cache/jev/` 中的 Jev 响应缓存会提交到仓库，新 clone 无 key 也能回放演示；A4 实验永远绕过缓存。
- 数据集：GitHub 服务条款（CC0 1.0）、RFC 7519（IETF Trust，保留版权声明），其余为合成数据。
