import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "127.0.0.1" }, (info) => {
  console.log(`[jev-lab] server listening on http://${info.address}:${info.port} (loopback only; set HOST to override)`);
  console.log(`[jev-lab] TYPESAFE_API_KEY ${process.env.TYPESAFE_API_KEY ? "set" : "MISSING"}; AWS_PROFILE=${process.env.AWS_PROFILE ?? "(default chain)"}`);
});
