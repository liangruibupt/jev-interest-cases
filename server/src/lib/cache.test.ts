import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileCache, cacheKey, resolveCacheMode } from "./cache";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("cache", () => {
  it("produces the same key regardless of key order", () => {
    expect(cacheKey({ a: 1, b: { c: 2, d: 3 } })).toBe(cacheKey({ b: { d: 3, c: 2 }, a: 1 }));
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });

  it("round-trips JSON values through files", async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-cache-"));
    const cache = new JsonFileCache<{ x: number }>(dir);
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", { x: 1 });
    expect(await cache.get("k")).toEqual({ x: 1 });
  });

  it("resolves cache mode from override, env, then default", () => {
    expect(resolveCacheMode("off")).toBe("off");
    const prev = process.env.JEV_CACHE;
    process.env.JEV_CACHE = "read-only";
    expect(resolveCacheMode()).toBe("read-only");
    process.env.JEV_CACHE = "garbage";
    expect(resolveCacheMode()).toBe("read-write");
    if (prev === undefined) delete process.env.JEV_CACHE;
    else process.env.JEV_CACHE = prev;
  });
});
