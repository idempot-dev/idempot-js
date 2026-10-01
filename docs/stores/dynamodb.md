---
title: DynamoDB Store - idempot-js
description: AWS DynamoDB-backed storage for idempotency middleware. Purpose-built for Lambda deployments: caller-owned client, conditional-write claims, and DynamoDB TTL support.
---

# DynamoDB Store

## Installation

```bash
npm install @idempot/dynamodb-store @aws-sdk/client-dynamodb
```

## Usage

```javascript
import { DynamoDbIdempotencyStore } from "@idempot/dynamodb-store";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

const store = new DynamoDbIdempotencyStore({
  client,
  tableName: "idempotency"
});

// Close on shutdown
process.on("SIGINT", async () => {
  await store.close();
  process.exit(0);
});
```

The client is caller-owned: point it at DynamoDB Local or an emulator with
`endpoint`, or leave it unset for real AWS (credentials come from the
environment, including Lambda's `AWS_ENDPOINT_URL`). See
[AWS Lambda](/guide/aws-lambda) for a Lambda-specific recipe.

## Table schema

Create the table before first use:

```bash
aws dynamodb create-table \
  --table-name idempotency \
  --attribute-definitions \
    AttributeName=key,AttributeType=S \
    AttributeName=fingerprint,AttributeType=S \
  --key-schema AttributeName=key,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"fingerprint-index","KeySchema":[{"AttributeName":"fingerprint","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST
```

Item shape:

| Attribute     | Type | Purpose                                                    |
| ------------- | ---- | ---------------------------------------------------------- |
| `key`         | S    | Primary key: the idempotency key                           |
| `fingerprint` | S    | GSI `fingerprint-index` partition key: request fingerprint |
| `status`      | S    | `processing` or `complete`                                 |
| `response`    | S    | JSON-serialized cached response (`complete` records only)  |
| `expiresAt`   | N    | Expiry as epoch milliseconds                               |
| `ttlEpoch`    | N    | Expiry as epoch seconds, for DynamoDB's per-item TTL       |

Enable DynamoDB TTL on the `ttlEpoch` attribute to let the service delete
expired records in the background:

```bash
aws dynamodb update-time-to-live \
  --table-name idempotency \
  --time-to-live-specification '{"Enabled": true, "AttributeName": "ttlEpoch"}'
```

Expired records read as absent even before the service deletes them, and
their keys are reclaimable by a new claim.

## API

### `new DynamoDbIdempotencyStore(options)`

**Options:**

- `client`: a `DynamoDBClient` instance (from `@aws-sdk/client-dynamodb`)
- `tableName`: table name (default: `idempotency`)

### `store.lookup(key, fingerprint)`

Look up an idempotency record. Returns `{byKey, byFingerprint}`. Reads the
key record and the fingerprint index in parallel; the middleware reconciles
a torn read where the two observe different instants under concurrency.

### `store.startProcessing(key, fingerprint, ttlMs)`

Atomically claim the key with a conditional write. Only the first
concurrent claim wins; losers raise `IdempotencyKeyExistsError`, which the
middleware turns into a 409 per the IETF Idempotency-Key draft.

### `store.complete(key, response)`

Store the response for a claimed key.

### `store.close()`

Destroy the injected client.
