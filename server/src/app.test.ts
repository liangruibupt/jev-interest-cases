import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("app", () => {
  it("reports health with env presence and queue stats", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; queues: { jev: { limit: number } }; cacheMode: string };
    expect(body.ok).toBe(true);
    expect(body.queues.jev.limit).toBeGreaterThan(0);
    expect(["off", "read-only", "read-write"]).toContain(body.cacheMode);
  });

  it("exposes and resets usage", async () => {
    const before = (await (await app.request("/api/usage")).json()) as { jev: { calls: number } };
    expect(before.jev.calls).toBeGreaterThanOrEqual(0);
    const reset = await app.request("/api/usage/reset", { method: "POST" });
    expect(reset.status).toBe(200);
  });

  it("maps thrown errors through toHttpError", async () => {
    const res = await app.request("/api/_boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal");
    expect(body.error.message).toBe("boom");
  });
});
