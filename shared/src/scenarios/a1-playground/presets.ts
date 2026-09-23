import type { Answers, EntryType, Questions } from "../../types";

export const A1_LIMITS = { maxQuestions: 12, maxStateChars: 12_000 } as const;

export interface NoulSummary {
  kind: "count_nouls_above";
  threshold: number;
  ids: string[];
  label_zh: string;
}

export interface A1Preset {
  id: string;
  title_zh: string;
  /** What this preset teaches (shown in the learning card). */
  lesson_zh: string;
  /** What to look for in the answers. */
  expect_zh: string;
  state: EntryType;
  questions: Questions;
  summarize?: NoulSummary;
}

export function summarizeNouls(answers: Answers, spec: NoulSummary): number {
  return spec.ids.reduce((n, id) => {
    const a = answers[id];
    return n + (a && a.type === "noul" && a.noul > spec.threshold ? 1 : 0);
  }, 0);
}

const STRIPE_TICKET = "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.";

const QUICKSTART_QUESTIONS: Questions = {
  department: {
    type: "choice",
    instructions: "Which team should handle this",
    criteria: { billing: "Payment or subscription issues", technical: "Bugs or integration problems", sales: "Pricing or account questions" },
  },
  frustration: {
    type: "score",
    instructions: "How frustrated the customer appears",
    criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"],
  },
  is_urgent: { type: "noul", instructions: "The message conveys urgency or time-sensitivity" },
};

const FRUIT_ITEMS = ["typesafe", "apple", "california", "banana", "likes", "calibration", "orange", "vertex"];

export const A1_PRESETS: A1Preset[] = [
  {
    id: "quickstart",
    title_zh: "1 · 快速开始：三种原语各一题",
    lesson_zh: "一次请求同时问 Choice、Score、Noul。注意 Choice 返回整条概率分布而不只是一个标签；Score 的值可以落在两级之间；Noul 没有 confidence，它本身就是概率。",
    expect_zh: "department=technical（概率接近 1），is_urgent ≈ 0.98，frustration 约 0.5–1.0。",
    state: STRIPE_TICKET,
    questions: QUICKSTART_QUESTIONS,
  },
  {
    id: "structured-state",
    title_zh: "2 · 结构化 state 与反引号路径",
    lesson_zh: "把工单、订单、政策放进一个 JSON 对象，用反引号路径告诉 Jev 该看哪一段。两个问题互相独立、并行评估。",
    expect_zh: "refund_requested ≈ 0.9+；policy_supports_refund 也应很高，因为政策明确覆盖重复扣款。",
    state: {
      ticket: {
        subject: "Duplicate charge",
        messages: [
          { from: "customer", text: "I was charged twice for order A-104. Please refund the duplicate." },
          { from: "support", text: "We are checking the charges." },
        ],
      },
      order: { id: "A-104", charges: [{ amount_usd: 49, status: "captured" }, { amount_usd: 49, status: "captured" }] },
      refund_policy: "Duplicate charges are eligible for a refund.",
    },
    questions: {
      refund_requested: { type: "noul", instructions: "Does `ticket.messages[0].text` request a refund?" },
      policy_supports_refund: {
        type: "noul",
        instructions: "Does `refund_policy` support the refund requested in `ticket.messages[0].text`, given `order.charges`?",
      },
    },
  },
  {
    id: "literal",
    title_zh: "3 · 字面理解：正向问法 vs 反向问法",
    lesson_zh: "Jev 按你写的字面意思回答。让\"高 = 是\"的正向问法最稳；反向问法（free of…）需要模型做一次否定转换，而且两个答案并不保证相加为 1（没有结构不变量）。",
    expect_zh: "contains_personal_data 高（≈0.9+），free_of_personal_data 低；两者之和不一定等于 1。",
    state: "Hi, I'm Jane Doe. My phone number is 415-555-0134 and I'd like to update my shipping address to 22 Baker Street.",
    questions: {
      contains_personal_data: { type: "noul", instructions: "Does the message contain personal data such as a name, phone number, or address?" },
      free_of_personal_data: { type: "noul", instructions: "Is the message free of personal data?" },
    },
  },
  {
    id: "counting",
    title_zh: "4 · 不要让它数数",
    lesson_zh: "Jev 不是计算器。让它数满足条件的项（坏问法）会得到模糊分布；正确做法是每项问一个 Noul，让代码求和。8 个 Noul 与 1 个 Choice 在同一次请求里并行评估。",
    expect_zh: "8 个 item_* 里 apple / banana / orange 接近 1，其余接近 0，代码求和 = 3。实测中 8 项的小列表 Choice 也能数对（3，置信 0.93）；官方说明误差随列表变长而增大，代码求和则永远精确且免费。",
    state: { items: FRUIT_ITEMS },
    questions: {
      how_many_fruits: {
        type: "choice",
        instructions: "How many of the entries in `items` are the names of fruits?",
        criteria: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), null])),
      },
      ...Object.fromEntries(FRUIT_ITEMS.map((_, i) => [`item_${i}`, { type: "noul" as const, instructions: `Is \`items[${i}]\` the name of a fruit?` }])),
    },
    summarize: { kind: "count_nouls_above", threshold: 0.5, ids: FRUIT_ITEMS.map((_, i) => `item_${i}`), label_zh: "代码求和：Noul > 0.5 的项数" },
  },
  {
    id: "score-levels",
    title_zh: "5 · Score 级别：数字 vs 情境描述",
    lesson_zh: "每个等级是单独对照 state 判断的，模型看不到等级编号也看不到相邻等级。只写数字的等级没有可对照的内容，概率会在 0 和 1 之间摇摆；写清情境的等级会把概率集中到一级。",
    expect_zh: "severity_numeric 置信度低（约 0.3），severity_descriptive 应落在 0（Cosmetic）且置信度接近 1。",
    state: "The export button is misaligned by a few pixels on the settings page.",
    questions: {
      severity_numeric: { type: "score", instructions: "Rate severity from 0 to 2, where 2 is worst", criteria: ["0", "1", "2"] },
      severity_descriptive: {
        type: "score",
        instructions: "How severe is the reported issue?",
        criteria: ["Cosmetic; no impact to functionality", "Broken or degraded feature, but a workaround exists", "Blocking issue; no workaround exists"],
      },
    },
  },
  {
    id: "contrastive",
    title_zh: "6 · 对照式 criteria：what / not_for / examples",
    lesson_zh: "两个容易混淆的选项，用结构化对象说明各自覆盖什么、不覆盖什么、举例。字段名不是 API 保留字，模型能看到字段名与内容。对比同一问题的字符串版本。",
    expect_zh: "两版都选 return_status。实测本例两版都是 1.00：这句话本身不歧义。把 state 改成边界句（如 \"Can I still send these back if I wore them once? It's been a week.\"）再比较两版的分布。",
    state: "I sent the shoes back a week ago. When do I get my money?",
    questions: {
      return_topic_plain: {
        type: "choice",
        instructions: "Which returns topic is the customer asking about?",
        criteria: { return_policy: "Whether and how an item can be returned", return_status: "Progress of a return already sent" },
      },
      return_topic_structured: {
        type: "choice",
        instructions: { question: "Which returns topic is the customer asking about?", focus: "Classify the information the customer wants." },
        criteria: {
          return_policy: {
            what: "Whether and how an item can be returned",
            not_for: "Progress of a return already sent",
            examples: ["Can I return shoes I've worn once?", "How long do I have to return an order?"],
          },
          return_status: {
            what: "Progress of a return already sent",
            not_for: "Whether and how an item can be returned",
            examples: ["Has my return arrived yet?", "When will my refund be paid?"],
          },
        },
      },
    },
  },
  {
    id: "cjk",
    title_zh: "7 · 中文输入对照",
    lesson_zh: "Jev 以英文为主训练；中文可用但准确率与置信度会下降。这组用预置 1 的中文译文和完全相同的英文问题，对比概率分布的差异。",
    expect_zh: "结论方向一致。实测本例中文版 department 置信度 0.92 反而高于英文版 0.76：单例不能证明语言差异。官方声明 CJK 整体准确率较低，上线前要用你自己的中文数据评估。",
    state: "你好，我已经尝试连接 Stripe 账户三天了，集成一直失败。我正在损失销售额。请尽快帮忙！",
    questions: QUICKSTART_QUESTIONS,
  },
];
