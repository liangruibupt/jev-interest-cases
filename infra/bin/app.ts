import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { JevLabStack } from "../lib/jev-lab-stack";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (put it in the repo's .env and run: set -a; source .env; set +a)`);
  return v;
};

const app = new App();
new JevLabStack(app, "JevLab", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEPLOY_REGION ?? "us-east-1" },
  // The account's us-east-1 bootstrap stack (CDKToolkit) uses a custom qualifier; override with CDK_QUALIFIER if yours differs.
  synthesizer: new DefaultStackSynthesizer({ qualifier: process.env.CDK_QUALIFIER ?? "mdi2024" }),
  repoRoot,
  typesafeApiKey: need("TYPESAFE_API_KEY"),
  originVerifySecret: need("ORIGIN_VERIFY_SECRET"),
  publicMode: (process.env.PUBLIC_MODE ?? "1") === "1",
  maxDailyUsd: Number(process.env.MAX_DAILY_USD ?? "5"),
  description: "Jev Lab — TypeSafe Jev learning scenarios (CloudFront → S3 / API Gateway → Lambda)",
});
