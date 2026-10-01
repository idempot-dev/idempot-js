// packages/stores/dynamodb/dynamodb.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds DynamoDB-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
import { test } from "tap";
import { IdempotencyKeyExistsError } from "@idempot/core";
import { DynamoDbIdempotencyStore } from "@idempot/dynamodb-store";
import { createFakeDynamoDBClient } from "./tests/dynamodb-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

runStoreTests({
  name: "dynamodb",
  createStore: () => {
    const client = createFakeDynamoDBClient();
    return new DynamoDbIdempotencyStore({ client });
  }
});

test("DynamoDbIdempotencyStore - startProcessing on existing key throws IdempotencyKeyExistsError", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  await store.startProcessing("dup-key", "fp-1", 60000);

  await t.rejects(
    store.startProcessing("dup-key", "fp-2", 60000),
    IdempotencyKeyExistsError,
    "loser should reject with IdempotencyKeyExistsError"
  );

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - startProcessing translates conditional check failures only", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  client.__putError = new Error("ProvisionedThroughputExceededException");
  client.__putError.name = "ProvisionedThroughputExceededException";

  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    /ProvisionedThroughputExceededException/,
    "non-conditional errors should propagate unchanged"
  );

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - lookup drops expired byKey record", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  client.__store.set("expired-key", {
    key: "expired-key",
    fingerprint: "expired-fp",
    status: "complete",
    response: JSON.stringify({
      status: 200,
      headers: {},
      body: "{}"
    }),
    ttlEpoch: Math.floor(Date.now() / 1000) - 10,
    expiresAt: Date.now() - 10_000
  });

  const result = await store.lookup("expired-key", "expired-fp");
  t.equal(result.byKey, null, "expired record should read as absent");

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - lookup drops expired byFingerprint record", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  client.__store.set("expired-key", {
    key: "expired-key",
    fingerprint: "expired-fp",
    status: "complete",
    response: JSON.stringify({
      status: 200,
      headers: {},
      body: "{}"
    }),
    ttlEpoch: Math.floor(Date.now() / 1000) - 10,
    expiresAt: Date.now() - 10_000
  });

  const result = await store.lookup("other-key", "expired-fp");
  t.equal(
    result.byFingerprint,
    null,
    "expired fingerprint record should read as absent"
  );

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - expired key is reclaimable by a new claim", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  const staleEpoch = Math.floor(Date.now() / 1000) - 5;
  client.__store.set("stale-key", {
    key: "stale-key",
    fingerprint: "old-fp",
    status: "processing",
    ttlEpoch: staleEpoch,
    expiresAt: Date.now() - 5_000
  });

  await store.startProcessing("stale-key", "new-fp", 60000);

  const result = await store.lookup("stale-key", "new-fp");
  t.equal(result.byKey.status, "processing", "new claim should own the key");
  t.equal(
    result.byKey.fingerprint,
    "new-fp",
    "new claim should carry its fingerprint"
  );

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - complete propagates non-conditional errors", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  await store.startProcessing("err-key", "err-fp", 60000);

  client.__updateError = new Error("Connection failed");

  await t.rejects(
    store.complete("err-key", { status: 200, headers: {}, body: "{}" }),
    /Connection failed/,
    "transient driver errors should propagate unchanged"
  );

  await store.close();
  t.end();
});

test("DynamoDbIdempotencyStore - close destroys the client", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({ client });

  await store.close();

  t.equal(client.__destroyed, true, "close should destroy the client");
  t.end();
});

test("DynamoDbIdempotencyStore - tableName option overrides default", async (t) => {
  const client = createFakeDynamoDBClient();
  const store = new DynamoDbIdempotencyStore({
    client,
    tableName: "custom"
  });

  await store.startProcessing("tbl-key", "tbl-fp", 60000);
  t.ok(client.__store.has("tbl-key"), "record should land in the fake table");

  await store.close();
  t.end();
});
