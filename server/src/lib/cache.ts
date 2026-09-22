import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stableStringify } from "@jev/shared";

export type CacheMode = "off" | "read-write" | "read-only";

export const JEV_CACHE_DIR = fileURLToPath(new URL("../../.cache/jev/", import.meta.url));

export function cacheKey(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function resolveCacheMode(override?: CacheMode): CacheMode {
  if (override) return override;
  const v = process.env.JEV_CACHE;
  return v === "off" || v === "read-only" || v === "read-write" ? v : "read-write";
}

export class JsonFileCache<T> {
  constructor(private readonly dir: string) {}

  async get(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir, `${key}.json`), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify(value, null, 2));
  }
}
