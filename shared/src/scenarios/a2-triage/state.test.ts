import { describe, expect, it } from "vitest";
import { TICKETS } from "../../datasets/tickets";
import { SENSITIVE_CREDENTIALS, buildTicketState } from "./state";

describe("buildTicketState", () => {
  it("sends only the fields the questions need and the credential policy", () => {
    const s = buildTicketState(TICKETS[0]!);
    expect(Object.keys(s)).toEqual(["ticket", "customer", "policy"]);
    expect(Object.keys(s.ticket)).toEqual(["subject", "message", "sender", "links"]);
    expect(s).not.toHaveProperty("ticket.expected_lanes");
    expect(s.policy.sensitive_credentials).toEqual([...SENSITIVE_CREDENTIALS]);
  });
});
