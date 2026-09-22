import { describe, expect, it } from "vitest";
import { stableStringify } from "./stableStringify";

describe("stableStringify", () => {
  it("is independent of key insertion order, recursively", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });
  it("preserves array order and primitives", () => {
    expect(stableStringify([2, 1, "x", null, true])).toBe('[2,1,"x",null,true]');
  });
});
