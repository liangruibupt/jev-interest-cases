import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { originVerify, publicModeBlock, spendCap } from "./guards";
import type { UsageSnapshot } from "./usage";

const snap = (usd: number): UsageSnapshot => ({ startedAt: "", jev: { calls: 1, cached: 0, usd, inputTokens: 0, totalLatencyMs: 0 }, claude: { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 } });

describe("deployment guards", () => {
  it("originVerify refuses requests without the CloudFront header and is a no-op without a secret", async () => {
    const app = new Hono();
    app.use("/api/*", originVerify("s3cret"));
    app.get("/api/x", (c) => c.text("ok"));
    expect((await app.request("/api/x")).status).toBe(403);
    expect((await app.request("/api/x", { headers: { "x-origin-verify": "s3cret" } })).status).toBe(200);
    const open = new Hono();
    open.use("/api/*", originVerify(undefined));
    open.get("/api/x", (c) => c.text("ok"));
    expect((await open.request("/api/x")).status).toBe(200);
  });
  it("spendCap returns 429 once the cap is reached, except for free paths", async () => {
    let usd = 0;
    const app = new Hono();
    app.use("/api/*", spendCap(1, () => snap(usd)));
    app.get("/api/health", (c) => c.text("ok"));
    app.get("/api/a1", (c) => c.text("ok"));
    expect((await app.request("/api/a1")).status).toBe(200);
    usd = 1;
    expect((await app.request("/api/a1")).status).toBe(429);
    expect((await app.request("/api/health")).status).toBe(200);
    const off = new Hono();
    off.use("/api/*", spendCap(0, () => snap(999)));
    off.get("/api/a1", (c) => c.text("ok"));
    expect((await off.request("/api/a1")).status).toBe(200);
  });
  it("publicModeBlock blocks only the listed prefixes when enabled", async () => {
    const app = new Hono();
    app.use("/api/*", publicModeBlock(true, ["/api/a4/run"]));
    app.get("/api/a4/run", (c) => c.text("ok"));
    app.get("/api/a4/results", (c) => c.text("ok"));
    expect((await app.request("/api/a4/run?caseId=x")).status).toBe(403);
    expect((await app.request("/api/a4/results")).status).toBe(200);
  });
});
