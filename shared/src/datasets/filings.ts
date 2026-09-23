/** Synthetic announcements about fictional companies for C3. Hand-labelled acceptable reading lanes for smoke checks. */
export type EventType =
  | "guidance_change" | "executive_change" | "restatement_or_accounting" | "going_concern_or_liquidity" | "m_and_a"
  | "major_customer_or_contract" | "litigation_or_regulatory" | "cyber_incident" | "capital_return" | "product_or_operations"
  | "insider_transaction" | "routine_housekeeping" | "other";
export type ReadingLane = "read_now" | "today" | "archive";

export interface Filing {
  id: string;
  company: string;
  source: "8-K" | "press_release" | "news";
  headline: string;
  text: string;
  expected: { lanes: ReadingLane[]; event?: EventType };
  note_zh: string;
}

export const FILINGS: Filing[] = [
  { id: "F01", company: "Northwind Foods", source: "8-K", headline: "Northwind Foods updates fiscal 2026 outlook",
    text: "Northwind Foods today lowered its fiscal 2026 adjusted EPS guidance to a range of $3.55 to $3.65 from the prior range of $4.15 to $4.25, citing higher input costs for cocoa and packaging and softer volumes in its snacks segment. Net sales guidance was reduced to growth of 1% to 2% from 4% to 5%. The company will discuss the revised outlook on its earnings call on November 6.",
    expected: { lanes: ["read_now"], event: "guidance_change" }, note_zh: "下调指引约 14%：重大、负面" },
  { id: "F02", company: "Halden Systems", source: "8-K", headline: "Departure of Chief Financial Officer",
    text: "On September 19, Halden Systems, Inc. announced that Maria Ostrowski, Chief Financial Officer, resigned effective immediately to pursue other opportunities. The Board has appointed Daniel Reyes, Corporate Controller, as interim Chief Financial Officer while it conducts a search. The company stated that Ms. Ostrowski's departure was not the result of any disagreement with the company on any matter relating to its operations, policies, or practices.",
    expected: { lanes: ["read_now", "today"], event: "executive_change" }, note_zh: "CFO 即刻离职：关键人物，措辞标准但值得立刻看" },
  { id: "F03", company: "Cobalt Ridge Analytics", source: "8-K", headline: "Non-reliance on previously issued financial statements",
    text: "On September 17, the Audit Committee of Cobalt Ridge Analytics concluded that the company's previously issued financial statements for the quarters ended March 31 and June 30, 2026 should no longer be relied upon due to errors in the timing of revenue recognition on certain multi-year subscription contracts. The company expects to restate those periods and currently estimates that revenue for the two quarters combined was overstated by approximately $18 million to $22 million. Management has identified a material weakness in internal control over financial reporting.",
    expected: { lanes: ["read_now"], event: "restatement_or_accounting" }, note_zh: "重述 + 内控重大缺陷：会计规则直接命中" },
  { id: "F04", company: "Meridian Freight", source: "press_release", headline: "Meridian Freight reports third-quarter results and provides liquidity update",
    text: "Meridian Freight reported a third-quarter net loss of $41 million. As of quarter end the company had $62 million of cash and was not in compliance with the minimum liquidity covenant under its revolving credit facility; it has obtained a limited waiver through December 15. Management stated that, absent additional financing or an amendment to the facility, there is substantial doubt about the company's ability to continue as a going concern.",
    expected: { lanes: ["read_now"], event: "going_concern_or_liquidity" }, note_zh: "持续经营疑虑：最高重大性" },
  { id: "F05", company: "Solvane Materials", source: "press_release", headline: "Solvane announces $500 million share repurchase authorization",
    text: "Solvane Materials' Board of Directors has authorized the repurchase of up to $500 million of the company's common stock over the next 24 months, replacing the prior program under which $80 million remained. Repurchases may be made from time to time in the open market or through privately negotiated transactions, depending on market conditions and other factors. The program does not obligate the company to acquire any particular amount of shares.",
    expected: { lanes: ["today", "archive"], event: "capital_return" }, note_zh: "回购授权：对股东正面，但 materiality 问的是\"对公司业务\"的影响，Jev 给 ≈ 0.9——今日看或归档都说得通" },
  { id: "F06", company: "Northwind Foods", source: "press_release", headline: "Northwind Foods introduces two new snack flavors",
    text: "Northwind Foods today announced the launch of Sea Salt & Lime and Smoky Chipotle flavors in its popular Ridge Cut chips line, available nationwide in October. The launch continues the brand's flavor innovation program and will be supported by in-store displays and a digital campaign.",
    expected: { lanes: ["archive"], event: "product_or_operations" }, note_zh: "两个新口味：归档" },
  { id: "F07", company: "Solvane Materials", source: "press_release", headline: "Solvane declares regular quarterly dividend",
    text: "The Board of Directors of Solvane Materials declared a regular quarterly cash dividend of $0.31 per share, unchanged from the prior quarter, payable on December 12 to shareholders of record as of November 28.",
    expected: { lanes: ["archive"], event: "capital_return" }, note_zh: "常规分红不变：归档" },
  { id: "F08", company: "Aurelia Biotech", source: "8-K", headline: "Jury verdict in patent litigation",
    text: "On September 20, a jury in the United States District Court for the District of Delaware returned a verdict finding that Aurelia Biotech's Veltrase product infringes two patents held by Carrow Pharmaceuticals and awarded damages of $85 million. Aurelia intends to file post-trial motions and, if necessary, to appeal. Veltrase accounted for approximately 38% of Aurelia's revenue in the most recent fiscal year.",
    expected: { lanes: ["read_now"], event: "litigation_or_regulatory" }, note_zh: "败诉 8,500 万美元，涉及 38% 收入的产品" },
  { id: "F09", company: "Halden Systems", source: "8-K", headline: "Notice of non-renewal from significant customer",
    text: "On September 18, Halden Systems received written notice from Tessaro Networks, its largest customer, that Tessaro does not intend to renew its master supply agreement when the current term expires on March 31, 2027. Sales to Tessaro represented approximately 22% of Halden's revenue in fiscal 2026. Halden is in discussions with Tessaro regarding a possible transition arrangement.",
    expected: { lanes: ["read_now"], event: "major_customer_or_contract" }, note_zh: "最大客户（22% 收入）不续约" },
  { id: "F10", company: "Cobalt Ridge Analytics", source: "8-K", headline: "Cybersecurity incident",
    text: "On September 14, Cobalt Ridge Analytics identified unauthorized access to a portion of its internal corporate network. The company activated its incident response plan, engaged outside forensic experts, and notified law enforcement. Customer-facing platforms were not affected and operations have continued without interruption. The investigation is ongoing and the company has not yet determined whether the incident will have a material impact on its financial condition or results of operations.",
    expected: { lanes: ["today", "read_now"], event: "cyber_incident" }, note_zh: "网络安全事件，影响未定：今日看" },
  { id: "F11", company: "Solvane Materials", source: "press_release", headline: "Solvane to acquire Ferrotek for $1.2 billion",
    text: "Solvane Materials and Ferrotek Holdings announced a definitive agreement under which Solvane will acquire Ferrotek for $1.2 billion in cash and stock, representing a 31% premium to Ferrotek's closing price on September 19. The transaction, expected to close in the first half of 2027 subject to regulatory and shareholder approvals, is expected to be accretive to adjusted EPS in the second year after closing.",
    expected: { lanes: ["read_now"], event: "m_and_a" }, note_zh: "12 亿美元并购" },
  { id: "F12", company: "Meridian Freight", source: "8-K", headline: "Changes in registrant's certifying accountant",
    text: "On September 15, the Audit Committee of Meridian Freight dismissed Whitfield & Lane LLP as the company's independent registered public accounting firm and engaged Brantley Coyle LLP. During the two most recent fiscal years there were no disagreements with Whitfield & Lane on any matter of accounting principles or practices, except as described in the following paragraph. Whitfield & Lane had advised the company of certain matters relating to the timing of expense recognition that the company considered and addressed in due course.",
    expected: { lanes: ["read_now", "today"], event: "restatement_or_accounting" }, note_zh: "更换审计师，\"except as described\" + \"certain matters\"：含糊措辞" },
  { id: "F13", company: "Aurelia Biotech", source: "8-K", headline: "Statement of changes in beneficial ownership",
    text: "On September 16, Dr. Priya Natarajan, Chief Scientific Officer of Aurelia Biotech, sold 12,000 shares of common stock at a weighted average price of $47.10 pursuant to a Rule 10b5-1 trading plan adopted on March 3, 2026. Following the sale, Dr. Natarajan beneficially owns 214,500 shares.",
    expected: { lanes: ["archive"], event: "insider_transaction" }, note_zh: "10b5-1 计划下的常规内部人卖出：归档" },
  { id: "F14", company: "Halden Systems", source: "press_release", headline: "Halden Systems reports record quarter and raises full-year outlook",
    text: "Halden Systems reported third-quarter revenue of $612 million, up 19% year over year, and adjusted EPS of $1.42 versus $1.10 a year ago, both ahead of the company's prior guidance. Citing strong demand in its industrial automation segment, the company raised its full-year revenue outlook to $2.35 billion to $2.40 billion from $2.20 billion to $2.28 billion.",
    expected: { lanes: ["read_now", "today"], event: "guidance_change" }, note_zh: "业绩超预期并上调指引：重大、正面" },
  { id: "F15", company: "Cobalt Ridge Analytics", source: "8-K", headline: "Submission of matters to a vote of security holders",
    text: "The annual meeting of stockholders of Cobalt Ridge Analytics was held on September 12. Stockholders elected the nine director nominees named in the proxy statement, ratified the appointment of the independent registered public accounting firm for fiscal 2027, and approved, on an advisory basis, the compensation of the named executive officers. This report contains forward-looking statements within the meaning of the Private Securities Litigation Reform Act of 1995; actual results may differ materially.",
    expected: { lanes: ["archive"], event: "routine_housekeeping" }, note_zh: "年会投票结果 + 安全港套话：归档" },
];
