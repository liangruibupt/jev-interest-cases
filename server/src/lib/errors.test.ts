import Anthropic from "@anthropic-ai/sdk";
import { QuestionValidationError } from "@jev/shared";
import { AuthenticationError, RateLimitError, UnprocessableEntityError } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeRefusalError } from "./claude";
import { toHttpError } from "./errors";

describe("toHttpError", () => {
  it("maps validation errors to 400 with issues", () => {
    const e = toHttpError(new QuestionValidationError([{ questionId: "q", message: "bad" }]));
    expect(e.status).toBe(400);
    expect(e.code).toBe("invalid_questions");
    expect(e.detail).toEqual([{ questionId: "q", message: "bad" }]);
  });
  it("maps Jev auth, 422 and rate limits", () => {
    expect(toHttpError(new AuthenticationError(401, { error: "nope" }, new Headers())).status).toBe(401);
    const u = toHttpError(new UnprocessableEntityError(422, { detail: [{ loc: ["body", "questions"], msg: "x" }] }, new Headers()));
    expect(u.status).toBe(422);
    expect(u.detail).toBeDefined();
    expect(toHttpError(new RateLimitError(429, {}, new Headers())).status).toBe(503);
  });
  it("maps Claude refusal and Bedrock throttling", () => {
    expect(toHttpError(new ClaudeRefusalError("cyber", null)).status).toBe(422);
    const throttled = new Anthropic.RateLimitError(429, { message: "ThrottlingException" }, "throttled", new Headers());
    expect(toHttpError(throttled).status).toBe(503);
  });
  it("falls back to 500 with the message", () => {
    const e = toHttpError(new Error("boom"));
    expect(e.status).toBe(500);
    expect(e.message).toBe("boom");
  });
});
