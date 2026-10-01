---
title: AWS Lambda - idempot-js
description: Run the idempotency middleware on AWS Lambda with the Hono runtime adapter and the DynamoDB store. Module-scope warm reuse, conditional-write claims under concurrent invocations, and packaging notes.
---

# AWS Lambda

The middleware runs on AWS Lambda through Hono's official Lambda adapter.
The application is the same Hono app you would serve from Node; the adapter
turns Lambda events into requests and responses.

## Handler

```javascript
import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { idempotency } from "@idempot/hono-middleware";
import { DynamoDbIdempotencyStore } from "@idempot/dynamodb-store";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Module scope: the client and store survive across invocations in a
// warm container, so the SDK handshake and connection setup happen once
// per container, not per request.
const client = new DynamoDBClient({ region: "us-east-1" });
const store = new DynamoDbIdempotencyStore({
  client,
  tableName: "idempotency"
});

const app = new Hono();
app.use("*", idempotency({ store }));
app.post("/api", (c) => c.json({ ok: true }));

export const handler = handle(app);
```

`handle()` auto-detects the event source: Lambda Function URLs, API Gateway
v1 and v2, ALB, and Lambda@Edge. For Lambda response streaming, use
`streamHandle(app)` instead. See the
[Hono AWS Lambda docs](https://hono.dev/docs/getting-started/aws-lambda)
for the full adapter surface.

## Storage

The DynamoDB store suits Lambda because both are regional AWS services
sharing the execution role's credentials. Inside Lambda the SDK reads
`AWS_ENDPOINT_URL` automatically when one is set, which is what local
emulators use; against real AWS no endpoint is needed. The store and the
client must live at module scope so a warm container reuses them.

## Concurrency behaviour

Lambda can run multiple containers for the same function. Each container
processes one invocation at a time, but two containers can process
requests with the same Idempotency-Key concurrently. The store's claim is
a conditional write, so exactly one invocation wins the key; the losers
receive a 409 and retry, and completed requests replay the stored
response. This is the same contract the library enforces on a single
long-running server.

Circuit-breaker state from the resilience layer persists per warm
container, so it remembers upstream failures across invocations on the
same container.

## Packaging

Bundle the handler with esbuild (the CDK `NodejsFunction` construct does
this by default, and the Hono docs use the same setup):

```bash
esbuild lambda/index.js --bundle --platform=node --target=node20 \
  --outfile=dist/index.js
```

Deploy with a Function URL (or API Gateway), and grant the execution role
`dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:Query`, and
`dynamodb:UpdateItem` on the idempotency table.

## Local testing

The integration tests in this repository exercise the Hono app through
`@hono/aws-lambda` against a DynamoDB-compatible endpoint. Locally, point
`DYNAMODB_ENDPOINT` at DynamoDB Local (`http://localhost:8000`) or at
Floci (`http://localhost:4566`), which emulates both DynamoDB and Lambda.
