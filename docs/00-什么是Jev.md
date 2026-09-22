# 00 · 什么是 Jev

**一句话**：Jev 是 TypeSafe 公司的首个 **System One 模型**。它像 LLM 一样读懂自然语言，但**不生成文字**，只回答你事先定义好的类型化问题，并返回**校准过的概率**与置信度，供代码直接使用。

## 与 LLM 的根本差别

| | LLM（Claude、GPT 等） | Jev（System One） |
|---|---|---|
| 输出 | 给人读的文字 | 给代码用的判断：`choice` / `score` / `noul` + 概率 |
| 训练目标 | RLHF（人类偏好）/ RLVR（可验证奖励，推理模型） | **RLCD**：Reinforcement Learning for Calibrated Decisions，直接优化决策与概率的校准 |
| 不确定性 | "口头"表达，常过度自信 | 概率分布本身就是答案，附带 confidence |
| 速度 | 1–10 秒 | 约 100–150 毫秒（官方数字） |
| 价格 | 输入 $1–10/Mtok，输出更贵 | 输入 $0.042/Mtok，输出免费 |
| 多题并行 | 串行或一次生成长 JSON 再解析 | 同一 state 的所有问题一次请求、并行、互相独立 |
| 擅长 | 生成、推理、多步规划 | 快速、窄、可组合的"常识判断" |

System One 的名字来自 Kahneman 的《思考，快与慢》：System 1 是快速直觉判断，System 2 是缓慢推理。Jev 只做前者，把流程与推理留给代码（或 LLM）。

## 关键数字（jev-1.13，2026-09）

- 模型别名 `jev-latest` → `jev-1.13.0`
- 价格：$42 / Btok = **$0.042 / Mtok** 输入，输出免费
- 上下文：每请求 64k tokens；state + 最长问题 ≤ 32k
- 限流：250k tokens/s、1,200 请求/分钟（动态调整中；社区经验并发 ≤ 8 稳妥）
- 输入：仅文本（字符串、JSON 对象、数组）；**英文为主**，中文等 CJK 可用但准确率较低
- 不做微调：用 `state` 传你的资料，用 `instructions` / `criteria` 传你的规则

## 何时该用、何时不该用

**该用**：路由/分类、检测（是否含某属性）、评分、排序/重排、验证 LLM 输出、从候选中选值、把文本变成 ML 特征——凡是"一个懂行的人看一眼就能判断"的事。

**不该用**：生成文字或代码、算数与计数、比较日期、多跳推理、需要读大量无关上下文的任务。这些交给代码，或交给 Claude。

## 在本项目里

- A1 原语实验室：亲手看三种原语的返回形状与延迟。
- A4 一致性对比：用同一组问题对比 Jev 与 Claude 的稳定性、延迟、成本。
- 全部场景的"成本对比"卡：同样的 tokens 若交给 LLM 会花多少。

## 官方资料

- System One 概念：https://docs.typesafe.ai/concepts/system-one
- AI primer（RLCD 与三种训练路径）：https://docs.typesafe.ai/introduction/machine-learning-primer
- 模型与价格：https://docs.typesafe.ai/models
- 文档索引：https://docs.typesafe.ai/llms.txt
