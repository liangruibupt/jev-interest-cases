export interface Citation {
  id: string;
  claim: string;
  section_id: string;
  quote: string;
}

export type Verdict = "verified" | "contradicted" | "unsupported" | "fabricated" | "misattributed";

export interface CannedCitation extends Citation {
  expected: Verdict;
  note_zh: string;
}

/** Eight hand-written citations over RFC 7519: four accurate, four failing in different ways. */
export const CANNED_CITATIONS: CannedCitation[] = [
  {
    id: "exp_leeway",
    claim: "Implementers may allow a small leeway of a few minutes for clock skew when checking the exp claim.",
    section_id: "4.1.4",
    quote: "Implementers MAY provide for some small leeway, usually no more than a few minutes, to account for clock skew.",
    expected: "verified",
    note_zh: "正确引用，句子在原文中跨行",
  },
  {
    id: "aud_reject",
    claim: "If the principal processing the JWT does not identify itself with a value in the aud claim when that claim is present, the JWT must be rejected.",
    section_id: "4.1.3",
    quote: 'If the principal processing the claim does not identify itself with a value in the "aud" claim when this claim is present, then the JWT MUST be rejected.',
    expected: "verified",
    note_zh: "正确引用，含引号与多处换行",
  },
  {
    id: "hs256_mandatory",
    claim: "Conforming JWT implementations must implement HS256 and the none algorithm.",
    section_id: "8",
    quote: 'only HMAC SHA-256 ("HS256") and "none" MUST be implemented by conforming JWT implementations.',
    expected: "verified",
    note_zh: "正确引用（实现要求）",
  },
  {
    id: "sign_then_encrypt",
    claim: "When both signing and encryption are needed, producers should normally sign first and then encrypt.",
    section_id: "11.2",
    quote: "normally producers should sign the message and then encrypt the result",
    expected: "verified",
    note_zh: "正确引用，原文这句话被页脚截断",
  },
  {
    id: "exp_required",
    claim: "Every JWT is required to carry an exp claim.",
    section_id: "4.1.4",
    quote: "Use of this claim is OPTIONAL.",
    expected: "contradicted",
    note_zh: "引文真实存在，但说的是相反的意思",
  },
  {
    id: "jti_uuid",
    claim: "The jti claim must be a version 4 UUID.",
    section_id: "4.1.7",
    quote: 'The "jti" value MUST be a UUID as defined in RFC 4122.',
    expected: "fabricated",
    note_zh: "引文在全文中不存在",
  },
  {
    id: "jwks_required",
    claim: "Validating a JWT requires fetching the issuer's JWKS endpoint to check the signature.",
    section_id: "7.2",
    quote: "Verify that the JWT contains at least one period ('.') character.",
    expected: "unsupported",
    note_zh: "引文真实，但与论断无关",
  },
  {
    id: "encryption_optional_misattributed",
    claim: "Support for encrypted JWTs is optional for implementations.",
    section_id: "4.1.4",
    quote: "Support for encrypted JWTs is OPTIONAL.",
    expected: "misattributed",
    note_zh: "引文真实但在第 8 节，不在所标的 4.1.4",
  },
];
