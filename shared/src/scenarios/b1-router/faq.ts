export type FaqTopic = "hours" | "refund_window" | "password_reset" | "shipping_times" | "cancel_subscription" | "invoice" | "supported_countries" | "contact";

/** Canned answers for the deterministic route. No model is involved when a message lands here. */
export const FAQ: Record<FaqTopic, { question_en: string; answer_en: string }> = {
  hours: { question_en: "What are your support hours?", answer_en: "Support is available Monday to Friday, 9:00–18:00 CET. Outside those hours you can leave a message and we reply the next business day." },
  refund_window: { question_en: "How long do I have to request a refund?", answer_en: "You can request a full refund within 30 days of purchase from the Billing page. Refunds are returned to the original payment method within 5–10 business days." },
  password_reset: { question_en: "How do I reset my password?", answer_en: "Open the sign-in page, click “Forgot password”, and we will email you a reset link that is valid for 30 minutes." },
  shipping_times: { question_en: "How long does shipping take?", answer_en: "Standard shipping takes 3–5 business days; express shipping takes 1–2 business days." },
  cancel_subscription: { question_en: "How do I cancel my subscription?", answer_en: "Go to Billing → Plan → Cancel. Your plan stays active until the end of the current billing period." },
  invoice: { question_en: "Where can I download an invoice?", answer_en: "Invoices for every payment are under Billing → Invoices. You can add a VAT number in Billing → Company details." },
  supported_countries: { question_en: "Which countries do you ship to?", answer_en: "We currently ship to the EU, the UK, the US, Canada, Japan, and Australia." },
  contact: { question_en: "How can I contact you?", answer_en: "Email support@example.com or use the chat widget in the app; enterprise customers can also call their account manager." },
};
