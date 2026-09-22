import Anthropic from "@anthropic-ai/sdk";
import { QuestionValidationError } from "@jev/shared";
import { APIConnectionError, APIError as JevAPIError, AuthenticationError, RateLimitError, UnprocessableEntityError } from "@typesafe-ai/sdk";
import { ClaudeRefusalError, ClaudeStructuredOutputError, ClaudeTierError } from "./claude";

export interface HttpErrorBody {
  status: number;
  code: string;
  /** Chinese, user-facing. */
  message: string;
  detail?: unknown;
}

/** Map SDK and domain errors to HTTP responses; the raw detail is kept for the inspector. */
export function toHttpError(err: unknown): HttpErrorBody {
  if (err instanceof QuestionValidationError) {
    return { status: 400, code: "invalid_questions", message: "问题定义不合法", detail: err.issues };
  }
  if (err instanceof ClaudeTierError) return { status: 400, code: "claude_tier", message: err.message };
  if (err instanceof AuthenticationError) {
    return { status: 401, code: "jev_auth", message: "TYPESAFE_API_KEY 无效或缺失" };
  }
  if (err instanceof UnprocessableEntityError) {
    return { status: 422, code: "jev_invalid_request", message: "Jev 拒绝了请求：问题形状不合法", detail: err.body };
  }
  if (err instanceof RateLimitError || (err instanceof JevAPIError && err.status === 529)) {
    return { status: 503, code: "jev_rate_limited", message: "Jev 限流，请稍后重试", detail: err.body };
  }
  if (err instanceof JevAPIError) {
    return { status: 502, code: "jev_error", message: `Jev 请求失败（HTTP ${err.status}）`, detail: err.body };
  }
  if (err instanceof APIConnectionError) {
    return { status: 504, code: "jev_connection", message: "无法连接 Jev API（网络或超时）" };
  }
  if (err instanceof ClaudeRefusalError) {
    return { status: 422, code: "claude_refusal", message: `Claude 拒绝了该请求${err.category ? `（${err.category}）` : ""}` };
  }
  if (err instanceof ClaudeStructuredOutputError) {
    return { status: 502, code: "claude_structured_output", message: err.message, detail: err.raw };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 503, code: "bedrock_throttled", message: "Bedrock 限流，请稍后重试" };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, code: "bedrock_auth", message: "AWS 凭证不可用或无权限，检查 AWS_PROFILE 与 Bedrock 模型访问" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, code: "bedrock_error", message: `Bedrock 请求失败（HTTP ${err.status ?? "?"}）`, detail: err.message };
  }
  if (err instanceof Error && /credential|ExpiredToken|Token is expired|sso/i.test(err.message)) {
    return { status: 500, code: "aws_credentials", message: "AWS 凭证不可用或已过期，请重新登录后重试", detail: err.message };
  }
  return { status: 500, code: "internal", message: err instanceof Error ? err.message : String(err) };
}
