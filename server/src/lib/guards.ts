import type { MiddlewareHandler } from "hono";
import type { UsageSnapshot } from "./usage";

/** Requests must carry the header CloudFront injects; direct calls to the API Gateway endpoint are refused. */
export function originVerify(secret: string | undefined, header = "x-origin-verify"): MiddlewareHandler {
  return async (c, next) => {
    if (secret && c.req.header(header) !== secret) return c.json({ error: { status: 403, code: "origin", message: "请通过站点域名访问 API" } }, 403);
    await next();
  };
}

/** Per-process spend cap for public demos: once Jev + Claude spend reaches the cap, paid routes return 429. */
export function spendCap(maxUsd: number, snapshot: () => UsageSnapshot, freePaths: readonly string[] = ["/api/health", "/api/usage"]): MiddlewareHandler {
  return async (c, next) => {
    if (maxUsd > 0 && !freePaths.some((p) => c.req.path === p || c.req.path.startsWith(`${p}/`))) {
      const s = snapshot();
      const spent = s.jev.usd + s.claude.usd;
      if (spent >= maxUsd) {
        return c.json({ error: { status: 429, code: "spend_cap", message: `公网演示的花费上限（$${maxUsd}）已用完，预置示例仍可回放；要跑实时请求请在本地运行。` } }, 429);
      }
    }
    await next();
  };
}

/** In public mode, routes that can burn real money (the A4 experiment runner) are switched off. */
export function publicModeBlock(enabled: boolean, blockedPrefixes: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (enabled && blockedPrefixes.some((p) => c.req.path.startsWith(p))) {
      return c.json({ error: { status: 403, code: "public_mode", message: "公网演示不运行真实的 A4 实验（单次约 $1.5）；请查看已保存的结果，或在本地运行。" } }, 403);
    }
    await next();
  };
}
