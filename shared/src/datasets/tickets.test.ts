import { describe, expect, it } from "vitest";
import { TICKETS } from "./tickets";

describe("TICKETS", () => {
  it("has 24 unique tickets with the planned lane mix", () => {
    expect(TICKETS).toHaveLength(24);
    expect(new Set(TICKETS.map((t) => t.id)).size).toBe(24);
    const primary = (lane: string) => TICKETS.filter((t) => t.expected_lanes[0] === lane).length;
    expect(primary("billing")).toBe(6);
    expect(primary("orders")).toBe(5);
    expect(primary("account")).toBe(4);
    expect(primary("technical")).toBe(5);
    expect(primary("quarantine")).toBe(2);
    expect(primary("review")).toBe(2);
  });
  it("every ticket has a sender email and non-empty message", () => {
    for (const t of TICKETS) {
      expect(t.sender.email).toMatch(/@/);
      expect(t.message.length).toBeGreaterThan(20);
    }
  });
});
