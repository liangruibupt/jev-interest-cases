/** Synthetic English support tickets for A2. Hand-labelled with acceptable lanes for smoke checks. */
export type Lane = "billing" | "orders" | "account" | "technical" | "review" | "quarantine";

export interface Ticket {
  id: string;
  subject: string;
  message: string;
  sender: { display_name: string; email: string };
  links: { text: string; url: string }[];
  customer: { plan: "free" | "pro" | "enterprise"; open_orders: { id: string; status: string }[] };
  /** Hand label; several lanes may be acceptable for ambiguous tickets (first = primary). */
  expected_lanes: Lane[];
  note_zh: string;
}

const noOrders: Ticket["customer"] = { plan: "pro", open_orders: [] };
const c = (name: string, email: string) => ({ display_name: name, email });

export const TICKETS: Ticket[] = [
  // ---- billing ×6 ----
  {
    id: "T01", subject: "Charged twice for order A-104",
    message: "I was charged twice for order A-104 on the 14th. Both charges show as captured on my card statement. Please refund the duplicate charge as soon as possible.",
    sender: c("Maya Chen", "maya.chen@gmail.com"), links: [],
    customer: { plan: "pro", open_orders: [{ id: "A-104", status: "delivered" }] },
    expected_lanes: ["billing"], note_zh: "清晰的退款请求",
  },
  {
    id: "T02", subject: "Price went up without notice",
    message: "My monthly invoice jumped from $29 to $39 this month and I never received any notice about a price change. Can you explain what happened and whether the old price still applies to my plan?",
    sender: c("Tom Okafor", "tom.okafor@outlook.com"), links: [], customer: noOrders,
    expected_lanes: ["billing"], note_zh: "账单疑问，不要求退款",
  },
  {
    id: "T03", subject: "Need an invoice for accounting",
    message: "Our finance team needs a proper invoice with our VAT number for the September payment. Could you send one over or tell me where to download it?",
    sender: c("Priya Raman", "priya@northwind-consulting.com"), links: [], customer: { plan: "enterprise", open_orders: [] },
    expected_lanes: ["billing"], note_zh: "只需要信息/文件",
  },
  {
    id: "T04", subject: "Cancel my subscription and refund the rest",
    message: "I'd like to cancel my Pro subscription effective today. Since I paid for the full year in March, please refund the unused months to my card.",
    sender: c("Lucas Meyer", "lucas.meyer@web.de"), links: [], customer: noOrders,
    expected_lanes: ["billing"], note_zh: "取消 + 按比例退款",
  },
  {
    id: "T05", subject: "Still being charged after cancelling",
    message: "I cancelled my subscription in July but I've been charged again in August and September. This is really annoying. I want both charges reversed and confirmation that the subscription is actually closed.",
    sender: c("Hannah Lee", "hannah.lee@yahoo.com"), links: [], customer: noOrders,
    expected_lanes: ["billing"], note_zh: "带情绪的退款请求",
  },
  {
    id: "T06", subject: "Coupon code didn't apply",
    message: "I entered the code SPRING20 at checkout but the 20% discount didn't show up on my receipt. Can you apply it retroactively or credit the difference?",
    sender: c("Diego Alvarez", "diego.alvarez@hotmail.com"), links: [], customer: noOrders,
    expected_lanes: ["billing"], note_zh: "优惠券 → 账单",
  },
  // ---- orders ×5 ----
  {
    id: "T07", subject: "Where is my order?",
    message: "Order A-221 was supposed to arrive last Friday and the tracking page hasn't updated in five days. Can you tell me where it is?",
    sender: c("Sofia Rossi", "sofia.rossi@gmail.com"), links: [],
    customer: { plan: "free", open_orders: [{ id: "A-221", status: "in_transit" }] },
    expected_lanes: ["orders"], note_zh: "提到未完成订单",
  },
  {
    id: "T08", subject: "Wrong item delivered",
    message: "I ordered the grey desk lamp (order A-305) but received a black one. I'd like the correct lamp sent out. Do I need to return the wrong one first?",
    sender: c("Ben Carter", "ben.carter@icloud.com"), links: [],
    customer: { plan: "pro", open_orders: [{ id: "A-305", status: "delivered" }] },
    expected_lanes: ["orders"], note_zh: "错发 → 换货",
  },
  {
    id: "T09", subject: "Cancel order before it ships",
    message: "I placed an order about an hour ago by mistake. Please cancel it before it ships. The order number is A-418.",
    sender: c("Aiko Tanaka", "aiko.tanaka@gmail.com"), links: [],
    customer: { plan: "free", open_orders: [{ id: "A-418", status: "processing" }] },
    expected_lanes: ["orders"], note_zh: "取消订单",
  },
  {
    id: "T10", subject: "Arrived damaged",
    message: "The ceramic planter in order A-377 arrived cracked on one side. The box looked crushed. I'd like an exchange for the same planter, or a refund if you're out of stock.",
    sender: c("Grace Whitfield", "grace.w@protonmail.com"), links: [],
    customer: { plan: "pro", open_orders: [{ id: "A-377", status: "delivered" }] },
    expected_lanes: ["orders", "billing"], note_zh: "损坏 → 换货，退款为备选",
  },
  {
    id: "T11", subject: "Delivery is two weeks late",
    message: "My order A-150 is now two weeks past the estimated delivery date. I understand delays happen, but I'd appreciate an updated ETA so I can plan around it.",
    sender: c("Omar Haddad", "omar.haddad@gmail.com"), links: [],
    customer: { plan: "free", open_orders: [{ id: "A-150", status: "delayed" }] },
    expected_lanes: ["orders"], note_zh: "平静的延迟询问",
  },
  // ---- account ×4 ----
  {
    id: "T12", subject: "Can't sign in, 2FA codes never arrive",
    message: "I can't sign in to my account. The two-factor codes are not arriving on my phone anymore since I changed carriers. Is there a way to reset 2FA so I can get back in?",
    sender: c("Nina Petrova", "nina.petrova@gmail.com"), links: [], customer: noOrders,
    expected_lanes: ["account"], note_zh: "登录 / 2FA",
  },
  {
    id: "T13", subject: "Change the email on my account",
    message: "I'm leaving my current employer and need to move my account from my work email to my personal one. How do I change the email address without losing my projects?",
    sender: c("Ethan Brooks", "ethan.brooks@acme-corp.com"), links: [], customer: noOrders,
    expected_lanes: ["account"], note_zh: "改邮箱",
  },
  {
    id: "T14", subject: "Delete my account and data",
    message: "Please delete my account and all associated data. I no longer use the service and want to make sure nothing is retained.",
    sender: c("Chloe Dubois", "chloe.dubois@orange.fr"), links: [], customer: { plan: "free", open_orders: [] },
    expected_lanes: ["account"], note_zh: "删除账户",
  },
  {
    id: "T15", subject: "Add a teammate as admin",
    message: "Could you add my colleague Ravi (ravi@northwind-consulting.com) to our workspace with admin permissions? I can't find the option in the settings page.",
    sender: c("Priya Raman", "priya@northwind-consulting.com"), links: [], customer: { plan: "enterprise", open_orders: [] },
    expected_lanes: ["account"], note_zh: "权限管理",
  },
  // ---- technical ×5 ----
  {
    id: "T16", subject: "API returning 500 on every request",
    message: "Since about 09:40 UTC every call to POST /v1/orders returns a 500 with request id req_8f2a. Steps: authenticate with our production key, send any valid order payload, observe the 500. We're on the Node SDK 3.2.1. Our checkout is down and we cannot process orders.",
    sender: c("Jonas Lindqvist", "jonas@fjordgear.se"), links: [], customer: { plan: "enterprise", open_orders: [] },
    expected_lanes: ["technical"], note_zh: "阻塞级 + 复现步骤",
  },
  {
    id: "T17", subject: "Export button crashes Safari",
    message: "Clicking Export on the settings page crashes the tab in Safari 17. It works fine in Chrome, so I can get by, but a few of our customers only use Safari.",
    sender: c("Mia Johansson", "mia.j@brightpath.io"), links: [], customer: noOrders,
    expected_lanes: ["technical"], note_zh: "有变通方案",
  },
  {
    id: "T18", subject: "Webhooks not firing",
    message: "Our order.created webhooks stopped arriving yesterday. Steps to reproduce: create a test order in sandbox, check the webhook logs — the event is listed as sent but our endpoint (https://hooks.brightpath.io/orders) never receives it. Nothing changed on our side.",
    sender: c("Mia Johansson", "mia.j@brightpath.io"), links: [{ text: "our endpoint", url: "https://hooks.brightpath.io/orders" }], customer: noOrders,
    expected_lanes: ["technical"], note_zh: "复现步骤 + 环境",
  },
  {
    id: "T19", subject: "App crashes on launch",
    message: "The mobile app crashes as soon as I open it after the latest update. It just closes. Please fix.",
    sender: c("Kai Nakamura", "kai.nakamura@gmail.com"), links: [], customer: { plan: "free", open_orders: [] },
    expected_lanes: ["technical"], note_zh: "无细节的崩溃报告",
  },
  {
    id: "T20", subject: "SSO redirect loop for the entire company",
    message: "Nobody at our company can log in since this morning. SSO just bounces between your login page and our identity provider in an endless loop. This is the second outage this quarter and frankly unacceptable. We need this fixed now or we'll be looking at alternatives.",
    sender: c("Victor Hale", "victor.hale@meridian-labs.com"), links: [], customer: { plan: "enterprise", open_orders: [] },
    expected_lanes: ["technical", "account"], note_zh: "愤怒 + 阻塞；登录问题但根因是技术故障",
  },
  // ---- phishing ×2 ----
  {
    id: "T21", subject: "Urgent: claim your employee bonus",
    message: "Congratulations! You have been selected for a $1,000 employee bonus. To receive it, confirm your payroll password today using the link below. This offer expires in 24 hours.",
    sender: c("Acme Payroll", "rewards@claim-bonus.example"), links: [{ text: "Claim bonus", url: "http://claim-bonus.example/acme" }], customer: { plan: "free", open_orders: [] },
    expected_lanes: ["quarantine"], note_zh: "钓鱼：奖金 + 索要密码 + 发件人不符",
  },
  {
    id: "T22", subject: "Security verification required",
    message: "We detected unusual activity on your account. To keep it secure, reply to this message with the one-time code we just sent to your phone so our security team can verify your identity.",
    sender: c("Security Team", "alerts@secure-verify.example"), links: [], customer: { plan: "free", open_orders: [] },
    expected_lanes: ["quarantine"], note_zh: "钓鱼：索要一次性验证码",
  },
  // ---- ambiguous ×2 ----
  {
    id: "T23", subject: "Late, wrong size, and charged twice",
    message: "My running shoes arrived two weeks late and in the wrong size. Also I see two charges of $120 on my card. What are you going to do about this?",
    sender: c("Marcus Bell", "marcus.bell@gmail.com"), links: [],
    customer: { plan: "pro", open_orders: [{ id: "A-512", status: "delivered" }] },
    expected_lanes: ["review", "orders", "billing"], note_zh: "跨三个部门，未说明想要什么",
  },
  {
    id: "T24", subject: "Locked out after upgrading, and maybe double charged",
    message: "I upgraded to Pro yesterday and now I can't log in at all — it says my password is wrong even after resetting it. I also think the upgrade was charged twice. Please sort this out.",
    sender: c("Elena Costa", "elena.costa@gmail.com"), links: [], customer: noOrders,
    expected_lanes: ["review", "account", "billing"], note_zh: "账户 + 账单双主题",
  },
];
