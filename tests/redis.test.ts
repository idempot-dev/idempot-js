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
