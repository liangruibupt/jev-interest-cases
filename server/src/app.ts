import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logger } from "hono/logger";
import { resolveCacheMode } from "./lib/cache";
import { apiErrorHandler } from "./lib/errors";
import { queues } from "./lib/queue";
import { usage } from "./lib/usage";
import { a1Routes } from "./routes/a1";
import { a2Routes } from "./routes/a2";
import { a3Routes } from "./routes/a3";
import { a4Routes } from "./routes/a4";
import { b1Routes } from "./routes/b1";
import { b2Routes } from "./routes/b2";
import { b3Routes } from "./routes/b3";
import { b4Routes } from "./routes/b4";
import { c1Routes } from "./routes/c1";

export const app = new Hono();

// No CORS: the browser reaches /api through the same-origin Vite proxy (dev) or the static server (prod).

app.onError(apiErrorHandler);
// Reject oversized bodies before parsing (A1 state limit is 12k chars; 256 KB leaves room for JSON questions).
app.use("/api/*", logger());
app.use("/api/*", bodyLimit({ maxSize: 256 * 1024 }));

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

// Test hook for the error middleware; only registered when tests ask for it.
if (process.env.JEV_TEST_HOOKS === "1") {
  app.get("/api/_boom", () => {
    throw new Error("boom");
  });
}

// Scenario routes.
app.route("/api/a1", a1Routes);
app.route("/api/a2", a2Routes);
app.route("/api/a3", a3Routes);
app.route("/api/a4", a4Routes);
app.route("/api/b1", b1Routes);
app.route("/api/b2", b2Routes);
app.route("/api/b3", b3Routes);
app.route("/api/b4", b4Routes);
app.route("/api/c1", c1Routes);

// Production: serve the built web app (run `npm run build` first) with an SPA fallback. Dev uses Vite's proxy instead.
const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
app.use("/*", serveStatic({ root: webDist }));
app.get("/*", serveStatic({ root: webDist, path: "index.html" }));
