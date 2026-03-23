// packages/stores/redis/redis.test.js
import { test } from "tap";
import RedisMock from "ioredis-mock";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";
import { RedisIdempotencyStore } from "@idempot/redis-store";

runStoreTests({
  name: "redis",
  createStore: () => new RedisIdempotencyStore({ client: new RedisMock() })
});

test("RedisIdempotencyStore - lookup handles deleted fingerprint record", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("key-1", "fp-1", 60000);

  await redis.del("idempotency:key-1");

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(
    result.byFingerprint,
    null,
    "byFingerprint should be null when record deleted"
  );
  t.end();
});

test("RedisIdempotencyStore - handles pipeline errors gracefully", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  const originalPipeline = redis.pipeline.bind(redis);
  redis.pipeline = function () {
    const pipeline = originalPipeline();
    const originalExec = pipeline.exec.bind(pipeline);
    pipeline.exec = async function () {
      throw new Error("Connection is closed");
    };
    return pipeline;
  };

  try {
    await store.lookup("test", "test");
    t.fail("should have thrown");
  } catch (err) {
    t.ok(err, "should throw error on connection failure");
  }
  t.end();
});

test("RedisIdempotencyStore - handles null pipeline results", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  const originalPipeline = redis.pipeline.bind(redis);
  redis.pipeline = function () {
    const pipeline = originalPipeline();
    pipeline.exec = async function () {
      return null;
    };
    return pipeline;
  };

  const result = await store.lookup("test", "test");
  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
  t.end();
});

test("RedisIdempotencyStore - complete throws when TTL is expired", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  const originalTtl = redis.ttl.bind(redis);
  redis.ttl = async function (key) {
    return -2;
  };

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

test("RedisIdempotencyStore - testMode lookup returns null for empty store", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
  t.end();
});

test("RedisIdempotencyStore - testMode lookup finds record by key", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.key, "key-1", "should find by key");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.end();
});

test("RedisIdempotencyStore - testMode lookup finds record by fingerprint", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byFingerprint?.key, "key-1", "should find by fingerprint");
  t.equal(
    result.byFingerprint?.fingerprint,
    "fp-1",
    "fingerprint should match"
  );
  t.end();
});

test("RedisIdempotencyStore - testMode startProcessing creates record", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.fingerprint, "fp-1", "fingerprint should be stored");
  t.end();
});

test("RedisIdempotencyStore - testMode complete updates record", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  await store.startProcessing("key-1", "fp-1", 60000);

  await store.complete("key-1", {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: '{"success":true}'
  });

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.equal(result.byKey?.response?.status, 200, "response status should match");
  t.same(
    result.byKey?.response?.headers,
    { "Content-Type": "application/json" },
    "headers should match"
  );
  t.equal(
    result.byKey?.response?.body,
    '{"success":true}',
    "body should match"
  );
  t.end();
});

test("RedisIdempotencyStore - testMode complete throws on missing key", async (t) => {
  const store = new RedisIdempotencyStore({ testMode: true });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err) {
    t.match(
      err.message,
      /No record found/i,
      "should throw error for missing key"
    );
  }
  t.end();
});

test("RedisIdempotencyStore - testMode with custom prefix", async (t) => {
  const store = new RedisIdempotencyStore({
    testMode: true,
    prefix: "custom:"
  });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.key, "key-1", "should find by key with custom prefix");
  t.end();
});

test("RedisIdempotencyStore - close calls client.quit in non-testMode", async (t) => {
  let quitCalled = false;
  const mockClient = {
    pipeline: () => ({
      get: () => {},
      exec: async () => [
        [null, null],
        [null, null]
      ]
    }),
    quit: async () => {
      quitCalled = true;
    }
  };

  const store = new RedisIdempotencyStore({
    client: /** @type {any} */ (mockClient),
    testMode: false
  });

  await store.close();

  t.equal(quitCalled, true, "client.quit() should be called");
  t.end();
});

test("RedisIdempotencyStore - close is no-op in testMode", async (t) => {
  const store = new RedisIdempotencyStore({
    testMode: true
  });

  await store.close();

  t.pass("close() should not throw in testMode");
  t.end();
});
