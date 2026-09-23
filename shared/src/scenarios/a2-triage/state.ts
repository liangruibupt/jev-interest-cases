import type { Ticket } from "../../datasets/tickets";

export const SENSITIVE_CREDENTIALS = ["password", "security code", "API key", "one-time code"] as const;

/** Only the fields the A2 questions reference; nothing that would leak the hand label. */
export function buildTicketState(t: Ticket) {
  return {
    ticket: { subject: t.subject, message: t.message, sender: t.sender, links: t.links },
    customer: { plan: t.customer.plan, open_orders: t.customer.open_orders },
    policy: { sensitive_credentials: [...SENSITIVE_CREDENTIALS] },
  };
}
export type TicketState = ReturnType<typeof buildTicketState>;
