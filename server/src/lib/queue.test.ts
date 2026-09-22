import { describe, expect, it } from "vitest";
import { createQueue } from "./queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createQueue", () => {
  it("never runs more than `limit` tasks at once and reports stats", async () => {
    const q = createQueue(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
      return "ok";
    };
    const started = Promise.all([q.run(task), q.run(task), q.run(task), q.run(task)]);
    expect(q.stats().limit).toBe(2);
    const results = await started;
    expect(results).toEqual(["ok", "ok", "ok", "ok"]);
    expect(peak).toBe(2);
    expect(q.stats().active).toBe(0);
  });
});
