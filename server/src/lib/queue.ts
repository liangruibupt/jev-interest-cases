import pLimit from "p-limit";

export interface Queue {
  run<T>(fn: () => Promise<T>): Promise<T>;
  stats(): { active: number; pending: number; limit: number };
}

export function createQueue(limit: number): Queue {
  const limiter = pLimit(limit);
  return {
    run: (fn) => limiter(fn),
    stats: () => ({ active: limiter.activeCount, pending: limiter.pendingCount, limit }),
  };
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/** Public TypeSafe endpoint throttles above ~8 concurrent; Bedrock account limits vary. */
export const queues = {
  jev: createQueue(envInt("JEV_CONCURRENCY", 6)),
  claude: createQueue(envInt("CLAUDE_CONCURRENCY", 3)),
};
