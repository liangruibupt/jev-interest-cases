import type { Questions } from "../../types";

export const A2_QUESTION_IDS = [
  "department",
  "requested_resolution",
  "bug_severity",
  "has_repro_steps",
  "refund_requested",
  "requests_credentials",
  "sender_identity_mismatch",
  "unexpected_reward",
  "mentions_open_order",
  "frustration",
] as const;
export type A2QuestionId = (typeof A2_QUESTION_IDS)[number];

/** Ten questions asked together for every ticket (speculative fan-out); code decides which answers matter. */
export const A2_QUESTIONS: Questions & Record<A2QuestionId, Questions[string]> = {
  department: {
    type: "choice",
    instructions: {
      question: "Which team should handle `ticket.message`?",
      focus: "Classify the customer's primary request, not every topic mentioned.",
    },
    criteria: {
      billing: {
        what: "Charges, invoices, refunds, subscriptions, prices",
        not_for: "Order tracking or signing in",
        examples: ["I was charged twice", "Where is my refund?", "Can I get an invoice?"],
      },
      orders: {
        what: "Order status, delivery, cancellation, returns, exchanges",
        not_for: "Charges or signing in",
        examples: ["Where is my package?", "Cancel my order", "The item arrived damaged"],
      },
      account: {
        what: "Signing in, passwords, 2FA, email changes, permissions, deleting the account",
        not_for: "Charges or delivery",
        examples: ["I can't sign in", "Change my email", "Add my teammate"],
      },
      technical: {
        what: "Bugs, errors, outages, crashes, API or integration failures",
        not_for: "Billing or delivery",
        examples: ["The export button crashes", "Our API calls return 500"],
      },
      other: "None of the above",
    },
  },
  requested_resolution: {
    type: "choice",
    instructions: "What does the customer want to happen?",
    criteria: {
      refund: "Money back",
      exchange: "Swap for a different item or size",
      replacement: "The same item sent again",
      fix: "A bug, outage, or access problem repaired",
      information: "Just an answer or a document, no action needed",
      other: "Something else",
    },
  },
  bug_severity: {
    type: "score",
    instructions: "If `ticket.message` reports a defect or outage, how severe is it?",
    criteria: ["Cosmetic; no impact to functionality", "Broken or degraded feature, but a workaround exists", "Blocking issue; no workaround exists"],
  },
  has_repro_steps: {
    type: "noul",
    instructions: "Does `ticket.message` describe specific steps to reproduce a problem, or name the environment (browser, device, version)?",
  },
  refund_requested: {
    type: "noul",
    instructions: "Does `ticket.message` explicitly ask for money back or an account credit?",
    criteria: {
      true: "Directly asks for a refund, credit, or money back",
      false: { what: "Does not ask for money back", not_for: "A billing complaint or question without a requested remedy" },
    },
  },
  requests_credentials: {
    type: "noul",
    instructions: {
      question: "Does `ticket.message` ask the recipient to disclose a credential listed in `policy.sensitive_credentials`?",
      focus: "A request to send the credential itself, not an instruction to reset or change it.",
    },
    criteria: {
      true: "Asks the recipient to reply with, type, or send a password, security code, API key, or one-time code",
      false: "No credential is requested",
    },
  },
  sender_identity_mismatch: {
    type: "noul",
    instructions: "Does the organization named in `ticket.sender.display_name` conflict with the domain of `ticket.sender.email`?",
    criteria: {
      true: "Claims an organization unrelated to the email domain",
      false: "The name and domain agree or make no organizational claim",
    },
  },
  unexpected_reward: {
    type: "noul",
    instructions: "Does `ticket.message` announce an unrequested prize, bonus, or payment for the recipient?",
  },
  mentions_open_order: {
    type: "noul",
    instructions: "Does `ticket.message` refer to one of `customer.open_orders` by id or identifying details?",
  },
  frustration: {
    type: "score",
    instructions: "How frustrated does the customer appear in `ticket.message`?",
    criteria: ["Calm and matter-of-fact", "Frustrated but civil", "Very angry, hostile, or threatening to leave"],
  },
};
