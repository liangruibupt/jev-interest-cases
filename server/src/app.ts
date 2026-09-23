import { serveStatic } from "@hono/node-server/serve-static";
import type { Trace } from "@jev/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveCacheMode } from "./lib/cache";
import { toHttpError } from "./lib/errors";
import { queues } from "./lib/queue";
import { usage } from "./lib/usage";
import { a1Routes } from "./routes/a1";
import { a2Routes } from "./routes/a2";

export const app = new Hono();

app.use("/api/*", cors());

app.onError((err, c) => {
  const e = toHttpError(err);
  if (e.status >= 500) console.error(`[api] ${c.req.method} ${c.req.path} ->`, err);
  return c.json({ error: e }, e.status as 500);
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    jevKey: Boolean(process.env.TYPESAFE_API_KEY),
    jevModel: process.env.JEV_MODEL ?? "jev-latest",
    awsProfile: process.env.AWS_PROFILE ?? null,
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    cacheMode: resolveCacheMode(),
    queues: { jev: queues.jev.stats(), claude: queues.claude.stats() },
  }),
);

app.get("/api/usage", (c) => c.json(usage.snapshot()));
app.post("/api/usage/reset", (c) => {
  usage.reset();
  return c.json({ ok: true });
});

// Test hook for the error middleware; harmless in production.
app.get("/api/_boom", () => {
  throw new Error("boom");
});

// Scenario routes.
app.route("/api/a1", a1Routes);
app.route("/api/a2", a2Routes);

// Production: serve the built web app (run `npm run build` first). Dev uses Vite's proxy instead.
app.use("/*", serveStatic({ root: "../web/dist" }));

/** Record traces into the usage accumulator; routes call this before responding. */
export function recordTraces(traces: readonly Trace[]): void {
  for (const t of traces) usage.record(t);
}
