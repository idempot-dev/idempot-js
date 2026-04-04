// packages/stores/redis/redis.unit.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds Redis-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
// For property-based tests, see redis.properties.test.js
import { test } from "tap";
import sinon from "sinon";
import { RedisIdempotencyStore } from "@idempot/redis-store";
import { createFakeRedisClient } from "./tests/redis-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

runStoreTests({
  name: "redis-unit",
  createStore: () => {
    const client = createFakeRedisClient();
    return new RedisIdempotencyStore({ client });
  }
});

test("RedisIdempotencyStore - with custom prefix", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({
    client,
    prefix: "custom:"
  });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.key, "key-1", "should find by key with custom prefix");
  t.end();
});

test("RedisIdempotencyStore - close calls client.quit", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.close();

  t.equal(client.quit.calledOnce, true, "client.quit should be called once");
  t.end();
});

test("RedisIdempotencyStore - handles null pipeline results", async (t) => {
  const client = createFakeRedisClient();
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      get: () => {},
      setex: () => {},
      exec: sinon.fake.resolves(null)
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  const result = await store.lookup("test", "test");
  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
  t.end();
});

test("RedisIdempotencyStore - handles pipeline errors gracefully", async (t) => {
  const client = createFakeRedisClient();
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      get: () => {},
      setex: () => {},
      exec: sinon.fake.rejects(new Error("Connection is closed"))
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  try {
    await store.lookup("test", "test");
    t.fail("should have thrown");
  } catch (err) {
    t.ok(err, "should throw error on connection failure");
  }
  t.end();
});

test("RedisIdempotencyStore - complete throws when TTL is expired", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing("test-key", "test-fp", 60000);

  sinon.replace(client, "ttl", sinon.fake.resolves(-2));
  t.teardown(() => sinon.restore());

  try {
    await store.complete("test-key", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err) {
    t.match(err.message, /expired/i, "should throw error for expired record");
  }
  t.end();
});

test("RedisIdempotencyStore - lookup handles deleted fingerprint record", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing("key-1", "fp-1", 60000);

  await client.del("idempotency:key-1");

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(
    result.byFingerprint,
    null,
    "byFingerprint should be null when record deleted"
  );
  t.end();
});
