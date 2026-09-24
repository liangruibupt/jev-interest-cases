import { handle } from "hono/aws-lambda";
import { app } from "./app";

/**
 * AWS Lambda entry (API Gateway HTTP API, payload v2). Static files are served from S3 through CloudFront,
 * so only `/api/*` reaches this function. Environment: TYPESAFE_API_KEY, JEV_CACHE=read-only,
 * JEV_CACHE_DIR, A4_RESULTS_DIR, PUBLIC_MODE=1, MAX_DAILY_USD, ORIGIN_VERIFY_SECRET.
 */
export const handler = handle(app);
