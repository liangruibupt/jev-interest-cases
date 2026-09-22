import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalizeText";

describe("normalizeText", () => {
  it("folds curly quotes, dashes, whitespace and case", () => {
    expect(normalizeText("  The “exp” claim — is\n OPTIONAL. ")).toBe('the "exp" claim - is optional.');
    expect(normalizeText("it’s")).toBe("it's");
  });
});
