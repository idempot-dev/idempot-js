import t from "tap";
import { execFileSync } from "child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ulid } from "ulid";
import {
  CreateFunctionUrlConfigCommand,
  DeleteFunctionCommand,
  DeleteFunctionUrlConfigCommand,
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand
} from "@aws-sdk/client-lambda";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  createDynamoDBStore,
  cleanupDynamoDB,
  getDynamoDBEndpoint
} from "./shared/dynamodb.js";

/**
 * Deploys the real Hono app (shared/lambda-app.js) to a Lambda emulator and
 * drives it over HTTP, so the deployed artifact — bundling, cold start,
 * Function URL, and the middleware's behaviour across separate containers —
 * is exercised end to end, not just simulated in-process.
 *
 * Gated: the test runs only when a Lambda API is reachable at
 * LAMBDA_ENDPOINT (default http://localhost:4566, Floci's port). CI has no
 * Lambda emulator, where it skips. Deploying requires the `zip` CLI.
 */

const LAMBDA_ENDPOINT = process.env.LAMBDA_ENDPOINT ?? "http://localhost:4566";
const REGION = "us-east-1";

async function probeLambdaApi() {
  const client = new LambdaClient({
    region: REGION,
    endpoint: LAMBDA_ENDPOINT,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    requestHandler: { requestTimeout: 3000, connectionTimeout: 1000 }
  });
  try {
    await client.send(new ListFunctionsCommand({}));
    return client;
  } catch {
    return null;
  }
}

const lambdaClient = await probeLambdaApi();
const lambdaAvailable = lambdaClient !== null;

async function bundleApp(bundleDir) {
  const esbuild = await import("esbuild");
  const outfile = path.join(bundleDir, "index.js");
  await esbuild.build({
    entryPoints: [path.resolve(import.meta.dirname, "shared/lambda-app.js")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile
  });
  const zipPath = path.join(bundleDir, "bundle.zip");
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: bundleDir });
  return zipPath;
}

/**
 * Floci's Lambda API does not extract code uploaded through the SDK's
 * ZipFile parameter (the invoke fails with "function has no deployed code"),
 * but accepts the identical request when it comes from the AWS CLI. Deploy
 * through the CLI, which this gated local test already requires.
 * @param {string} functionName
 * @param {string} zipPath
 * @param {string} tableName
 * @returns {void}
 */
function createFunctionViaCli(functionName, zipPath, tableName) {
  execFileSync(
    "aws",
    [
      "lambda",
      "create-function",
      "--function-name",
      functionName,
      "--runtime",
      "nodejs20.x",
      "--handler",
      "index.handler",
      "--zip-file",
      `fileb://${zipPath}`,
      "--role",
      "arn:aws:iam::000000000000:role/lambda-role",
      "--memory-size",
      "256",
      "--timeout",
      "30",
      "--environment",
      `Variables={IDEMPOTENCY_TABLE=${tableName}}`,
      "--region",
      REGION,
      "--endpoint-url",
      LAMBDA_ENDPOINT,
      "--no-cli-pager"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
}

/** @param {number} ms */
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForFunctionUrl(url) {
  // Any HTTP response means the emulator is serving the URL; a 5xx can be
  // the container warming up, so do not treat it as "not up".
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await settle(500);
    }
  }
  throw new Error(`Function URL ${url} not reachable after 30s`);
}

/**
 * The first POST can land while the function container is still warming.
 * Retry until a non-5xx response or the window closes.
 * @param {string} url
 * @param {string} key
 * @returns {Promise<Response>}
 */
async function postWithWarmupRetry(url, key) {
  const apiPath = url.replace(/\/$/, "") + "/api";
  let lastError;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: {
          "idempotency-key": key,
          "content-type": "application/json"
        },
        body: JSON.stringify({ foo: "bar" })
      });
      if (res.status < 500) return res;
      lastError = new Error(`warmup 5xx: ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await settle(500);
  }
  throw lastError ?? new Error(`POST to ${url} never succeeded`);
}

t.test(
  "Deployed Hono app on Lambda - replay and conflict over Function URL",
  {
    skip: lambdaAvailable
      ? false
      : "no Lambda emulator reachable (set LAMBDA_ENDPOINT)"
  },
  async (t) => {
    const { store, client, tableName } = await createDynamoDBStore();
    const functionName = `idempotency-e2e-${ulid().toLowerCase()}`;
    const bundleDir = await mkdtemp(path.join(tmpdir(), "lambda-e2e-"));

    try {
      const zipPath = await bundleApp(bundleDir);

      createFunctionViaCli(functionName, zipPath, tableName);

      // The emulator's Function URL does not trigger a cold container start;
      // one direct API invoke warms the container before URL probes.
      const warmup = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: JSON.stringify({
            version: "2.0",
            routeKey: "POST /api",
            rawPath: "/api",
            requestContext: { http: { method: "POST", path: "/api" } },
            headers: {},
            body: "{}",
            isBase64Encoded: false
          })
        })
      );
      if (warmup.FunctionError) {
        throw new Error(
          `warmup invoke failed: ${Buffer.from(warmup.Payload ?? "")
            .toString()
            .slice(0, 200)}`
        );
      }
      const urlConfig = await lambdaClient.send(
        new CreateFunctionUrlConfigCommand({
          FunctionName: functionName,
          AuthType: "NONE"
        })
      );
      const url = urlConfig.FunctionUrl;
      // The Function URL base path is "/" but the app routes mount under /api.
      const apiPath = url.replace(/\/$/, "") + "/api";
      await waitForFunctionUrl(url);

      const key = "lambda-deploy-1234567890123456";
      const res1 = await postWithWarmupRetry(url, key);
      t.equal(
        res1.status,
        200,
        `first deployed request should return 200 (got ${res1.status}: ${await res1.clone().text()})`
      );
      const body1 = await res1.text();

      // Wait for the record to complete before replaying.
      for (let i = 0; i < 20; i++) {
        await settle(50);
        const result = await client.send(
          new GetItemCommand({
            TableName: tableName,
            Key: { key: { S: key } }
          })
        );
        if (result.Item) break;
      }
      await settle(50);

      const res2 = await fetch(apiPath, {
        method: "POST",
        headers: { "idempotency-key": key, "content-type": "application/json" },
        body: JSON.stringify({ foo: "bar" })
      });
      t.equal(res2.status, 200, "replayed request should return 200");
      t.equal(
        res2.headers.get("x-idempotent-replayed"),
        "true",
        "replay header should be set"
      );
      t.equal(
        await res2.text(),
        body1,
        "replayed body must match the stored response"
      );

      // Same fingerprint through the adapter under a different key.
      const res3 = await fetch(apiPath, {
        method: "POST",
        headers: {
          "idempotency-key": "lambda-deploy-other-123456789012",
          "content-type": "application/json"
        },
        body: JSON.stringify({ foo: "bar" })
      });
      t.equal(res3.status, 409, "fingerprint conflict should return 409");

      t.pass("deployed function url served replay and conflict correctly");
    } finally {
      await rm(bundleDir, { recursive: true, force: true });
      await cleanupDynamoDB(client, tableName);
      try {
        await lambdaClient.send(
          new DeleteFunctionUrlConfigCommand({ FunctionName: functionName })
        );
      } catch {
        // emulator may remove it with the function
      }
      try {
        await lambdaClient.send(
          new DeleteFunctionCommand({ FunctionName: functionName })
        );
      } catch {
        // best-effort cleanup
      }
      await store.close();
    }
  }
);

// Keep the module import of getDynamoDBEndpoint honest: the endpoint override
// flows through createDynamoDBStore.
t.test("bundle prerequisites", { skip: !lambdaAvailable }, (t) => {
  t.ok(getDynamoDBEndpoint(), "dynamodb endpoint must be set");
  t.end();
});
