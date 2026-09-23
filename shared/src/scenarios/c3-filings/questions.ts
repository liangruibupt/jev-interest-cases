import type { EventType, Filing } from "../../datasets/filings";
import type { Questions } from "../../types";

export const C3_QUESTION_IDS = ["event_type", "materiality", "direction", "is_forward_looking", "hedged_language", "accounting_or_controls", "key_person", "boilerplate"] as const;

export const EVENT_TYPES: readonly EventType[] = [
  "guidance_change", "executive_change", "restatement_or_accounting", "going_concern_or_liquidity", "m_and_a", "major_customer_or_contract",
  "litigation_or_regulatory", "cyber_incident", "capital_return", "product_or_operations", "insider_transaction", "routine_housekeeping", "other",
];

/** Judgments about the text of an announcement. Nothing here asks about price, valuation, or the future of the stock. */
export const C3_QUESTIONS: Questions = {
  event_type: {
    type: "choice",
    instructions: { question: "What kind of event does `text` announce?", focus: "Pick the single main event." },
    criteria: {
      guidance_change: "Raises, lowers, or withdraws financial guidance or outlook",
      executive_change: "A CEO, CFO, director, or other key executive departs, is appointed, or is replaced",
      restatement_or_accounting: "Restatement, non-reliance on prior financials, auditor change, or internal-control weakness",
      going_concern_or_liquidity: "Going-concern doubt, covenant breach, default, or a liquidity shortfall",
      m_and_a: "Acquisition, merger, divestiture, or sale of the company",
      major_customer_or_contract: "Gain or loss of a major customer, supplier, or contract",
      litigation_or_regulatory: "Lawsuit outcome, regulatory action, fine, or investigation",
      cyber_incident: "Cybersecurity breach or unauthorized access",
      capital_return: "Dividend or share repurchase",
      product_or_operations: "Product launch, facility, or ordinary operational news",
      insider_transaction: "Purchase or sale of shares by an insider",
      routine_housekeeping: "Meeting results, filings calendar, or other administrative notices",
      other: "None of the above",
    },
  },
  materiality: {
    type: "score",
    instructions: { question: "How significant is the event in `text` for the company's business?", focus: "Judge the event as described, not how the market might react." },
    criteria: [
      "Routine housekeeping with no effect on results or operations",
      "Noteworthy but expected, or small relative to the size of the business",
      "Significant to results, operations, leadership, or a major product or customer",
      "Could change how the business is valued or whether it continues as a going concern",
    ],
  },
  direction: {
    type: "choice",
    instructions: "As described in `text`, is the news good or bad for the company's shareholders?",
    criteria: { negative: null, neutral: "No clear effect either way", positive: null, mixed: "Clearly good and bad elements together" },
  },
  is_forward_looking: {
    type: "noul",
    instructions: "Does `text` mainly announce expectations, plans, or intentions rather than events that have already happened?",
  },
  hedged_language: {
    type: "noul",
    instructions: "Does `text` use vague, evasive, or unusually hedged wording about causes, amounts, or reasons where specifics would normally be given (for example 'certain matters', 'in due course', 'other opportunities' with no detail)?",
    criteria: { true: "Key facts are described vaguely where a reader would expect specifics", false: "The wording is specific, or the vagueness is ordinary legal boilerplate" },
  },
  accounting_or_controls: {
    type: "noul",
    instructions: "Does `text` involve financial reporting errors, a restatement, an auditor change, or internal-control weaknesses?",
  },
  key_person: {
    type: "noul",
    instructions: "Does `text` involve the departure, arrival, conduct, or transactions of a CEO, CFO, board member, or other named key person?",
  },
  boilerplate: {
    type: "noul",
    instructions: "Is `text` mostly standard boilerplate (safe-harbor language, routine notices, formulaic statements) rather than substantive news?",
  },
};

/** Deliberately not asked: judgments that need prices, valuation, or the future. */
export const C3_NOT_ASKED: { question: string; why_zh: string }[] = [
  { question: "Should I buy or sell?", why_zh: "买卖取决于价格、仓位与风险偏好，不是读一段公告能下的判断。" },
  { question: "Is the stock undervalued?", why_zh: "估值是数字与模型；Jev 不比较数字。" },
  { question: "Will the price go up tomorrow?", why_zh: "预测不是判断。" },
  { question: "How much will earnings fall?", why_zh: "算术与预测；金额只由代码从原文提取用于展示。" },
];

export function buildFilingState(f: Filing): { company: string; source: string; headline: string; text: string } {
  return { company: f.company, source: f.source, headline: f.headline, text: f.text };
}
