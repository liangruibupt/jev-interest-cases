import { describe, expect, it } from "vitest";
import { CANNED_CITATIONS } from "./citations";
import { findQuoteAnywhere, locateQuote } from "./match";
import { RFC_SECTIONS } from "./sections";

const section = (id: string) => RFC_SECTIONS.find((s) => s.id === id)!;
const canned = (id: string) => CANNED_CITATIONS.find((c) => c.id === id)!;

describe("quote matching", () => {
  it("finds quotes that wrap across RFC lines", () => {
    expect(locateQuote(canned("aud_reject").quote, section("4.1.3")).found).toBe(true);
    expect(locateQuote(canned("exp_leeway").quote, section("4.1.4")).found).toBe(true);
  });
  it("survives a sentence broken across a page footer", () => {
    expect(locateQuote(canned("sign_then_encrypt").quote, section("11.2")).found).toBe(true);
  });
  it("folds curly quotes and case", () => {
    expect(locateQuote("only hmac sha-256 (“hs256”) and “none” must be implemented", section("8")).found).toBe(true);
  });
  it("does not find fabricated text anywhere", () => {
    expect(locateQuote(canned("jti_uuid").quote, section("4.1.7")).found).toBe(false);
    expect(findQuoteAnywhere(canned("jti_uuid").quote, RFC_SECTIONS)).toBeUndefined();
  });
  it("finds a misattributed quote in its real section", () => {
    const c = canned("encryption_optional_misattributed");
    expect(locateQuote(c.quote, section(c.section_id)).found).toBe(false);
    expect(findQuoteAnywhere(c.quote, RFC_SECTIONS)).toBe("8");
  });
});
