// packages/stores/redis/tests/redis.test.js
import { test } from "tap";
import RedisMock from "ioredis-mock";
import { runStoreTests } from "../../../core/tests/store-adapter-suite.js";
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
  t.equal(result.byFingerprint, null, "byFingerprint should be null when record deleted");
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
