import { test } from "tap";
import RedisMock from "ioredis-mock";
import { RedisIdempotencyStore } from "../src/store/redis.js";

test("RedisIdempotencyStore - initialization", (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });
  t.ok(store, "store should be created");
  t.end();
});

test("RedisIdempotencyStore - lookup with empty store", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});

test("RedisIdempotencyStore - startProcessing creates keys", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "record should exist by key");
  t.ok(result.byFingerprint, "record should exist by fingerprint");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.key, "test-key", "key should match");
  t.equal(result.byKey?.fingerprint, "test-fp", "fingerprint should match");
  t.ok(
    result.byKey?.expiresAt && result.byKey.expiresAt > Date.now(),
    "should have future expiration"
  );
});

test("RedisIdempotencyStore - complete updates record", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result":"ok"}',
  });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.ok(result.byKey?.response, "response should be stored");
  t.equal(result.byKey?.response?.status, 200, "response status should match");
  t.same(
    result.byKey?.response?.headers,
    { "content-type": "application/json" },
    "response headers should match"
  );
  t.equal(
    result.byKey?.response?.body,
    '{"result":"ok"}',
    "response body should match"
  );
});

test("RedisIdempotencyStore - cleanup is no-op", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  // Add record (Redis mock doesn't actually expire keys)
  await store.startProcessing("test-key", "test-fp", 60000);

  // Cleanup should not throw
  await store.cleanup();

  // Record should still exist (mock doesn't expire)
  const result = await store.lookup("test-key", "test-fp");
  t.ok(result.byKey, "record should still exist after cleanup");
});

test("RedisIdempotencyStore - complete throws on missing key", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test",
    });
    t.fail("should have thrown");
  } catch (err: unknown) {
    const error = err as Error;
    t.match(error.message, /No record found/, "should throw error for missing key");
  }
});

test("RedisIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");
  t.equal(result.byFingerprint?.key, "key-1", "fingerprint should point to key-1");
});

test("RedisIdempotencyStore - handles pipeline errors gracefully", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  // Mock pipeline.exec() to throw error on closed connection
  const originalPipeline = redis.pipeline.bind(redis);
  redis.pipeline = function() {
    const pipeline = originalPipeline();
    const originalExec = pipeline.exec.bind(pipeline);
    pipeline.exec = async function() {
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
});
