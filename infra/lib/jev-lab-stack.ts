import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

export interface JevLabStackProps extends StackProps {
  repoRoot: string;
  typesafeApiKey: string;
  /** CloudFront adds this as `x-origin-verify`; the Lambda refuses requests without it, so the API Gateway URL is not usable directly. */
  originVerifySecret: string;
  publicMode: boolean;
  maxDailyUsd: number;
}

/**
 * Static web on S3 (private, Origin Access Control) + Hono API on Lambda behind an API Gateway HTTP API,
 * both behind one CloudFront distribution. No Lambda Function URL and no public bucket.
 */
export class JevLabStack extends Stack {
  constructor(scope: Construct, id: string, props: JevLabStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "Web", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const api = new NodejsFunction(this, "Api", {
      entry: path.join(props.repoRoot, "server/src/lambda.ts"),
      projectRoot: props.repoRoot,
      depsLockFilePath: path.join(props.repoRoot, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      // API Gateway HTTP API caps integrations at 30 s; the runner (A4) is disabled in public mode anyway.
      timeout: Duration.seconds(29),
      reservedConcurrentExecutions: 5,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      environment: {
        TYPESAFE_API_KEY: props.typesafeApiKey,
        ORIGIN_VERIFY_SECRET: props.originVerifySecret,
        PUBLIC_MODE: props.publicMode ? "1" : "0",
        MAX_DAILY_USD: String(props.maxDailyUsd),
        JEV_CACHE: "read-only",
        JEV_CACHE_DIR: "/var/task/cache/",
        A4_RESULTS_DIR: "/var/task/results/",
        JEV_CONCURRENCY: "4",
        CLAUDE_CONCURRENCY: "2",
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
        banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        externalModules: [],
        minify: false,
        sourceMap: true,
        sourcesContent: false,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // Ship the committed Jev cache (preset replays cost nothing) and the saved A4 experiments.
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp -R "${inputDir}/server/.cache/jev" "${outputDir}/cache"`,
            `mkdir -p "${outputDir}/results" && cp "${inputDir}"/docs/results/a4-*.json "${outputDir}/results/"`,
          ],
        },
      },
    });
    api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"], // global inference profiles route to several regions' foundation models
      }),
    );

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", { apiName: "jev-lab-api", createDefaultStage: true });
    httpApi.addRoutes({ path: "/api/{proxy+}", methods: [apigwv2.HttpMethod.ANY], integration: new HttpLambdaIntegration("ApiIntegration", api) });
    const apiDomain = `${httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`;

    // SPA: paths without a file extension (and outside /api) serve index.html.
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; var u = r.uri; if (u.indexOf('/api/') !== 0 && u.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Jev Lab",
      defaultRootObject: "index.html",
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            customHeaders: { "x-origin-verify": props.originVerifySecret },
            readTimeout: Duration.seconds(60),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new s3deploy.BucketDeployment(this, "WebDeployment", {
      sources: [s3deploy.Source.asset(path.join(props.repoRoot, "web/dist"))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      memoryLimit: 512,
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "ApiGatewayDomain", { value: apiDomain, description: "Direct calls are refused (missing x-origin-verify); use the site URL." });
  }
}
