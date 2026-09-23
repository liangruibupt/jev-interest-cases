import { describe, expect, it } from "vitest";
import { RFC_SECTIONS, parseRfcSections, rfcBodyForPrompt } from "./sections";
import { RFC7519_TEXT } from "../../datasets/rfc7519";

describe("RFC 7519 sections", () => {
  it("parses 45 body sections without table-of-contents noise", () => {
    const s = parseRfcSections(RFC7519_TEXT);
    expect(s).toHaveLength(45);
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(["1", "4.1.4", "7.2", "11.2", "13.2"]));
    const exp = s.find((x) => x.id === "4.1.4")!;
    expect(exp.title).toContain("Expiration Time");
    expect(exp.text).toContain("Use of this claim is OPTIONAL");
    expect(exp.text).not.toMatch(/\. \. \./);
    expect(exp.text).not.toMatch(/Jones, et al\./);
    expect(RFC_SECTIONS).toHaveLength(45);
  });
  it("builds a prompt body from sections 1-12 only", () => {
    const body = rfcBodyForPrompt();
    expect(body.length).toBeGreaterThan(30_000);
    expect(body.length).toBeLessThan(55_000);
    expect(body).toContain("## 4.1.4");
    expect(body).not.toContain("## 13");
  });
});
