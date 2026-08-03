// packages/stores/redis/redis.unit.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds Redis-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
// For property-based tests, see redis.properties.test.js
import { test } from "tap";
import sinon from "sinon";
import { IdempotencyKeyExistsError } from "@idempot/core";
import { RedisIdempotencyStore } from "@idempot/redis-store";
import { createFakeRedisClient } from "./tests/redis-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

const RACE_KEY = "race-key-12345678901234567890";
const RACE_FP = "race-fp-12345678901234567890";

test("RedisIdempotencyStore - startProcessing on existing key throws IdempotencyKeyExistsError", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing(RACE_KEY, RACE_FP, 60000);

  await t.rejects(
    store.startProcessing(RACE_KEY, RACE_FP, 60000),
    IdempotencyKeyExistsError,
    "loser should reject with IdempotencyKeyExistsError"
  );
  t.end();
});

test("RedisIdempotencyStore - loser does not overwrite winner's record", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing(RACE_KEY, RACE_FP, 60000);
  await t.rejects(
    store.startProcessing(RACE_KEY, RACE_FP, 60000),
    IdempotencyKeyExistsError
  );

  const result = await store.lookup(RACE_KEY, RACE_FP);
  t.equal(
    result.byKey?.fingerprint,
    RACE_FP,
    "winner's record is intact after the loser loses the race"
  );
  t.end();
});

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

test("RedisIdempotencyStore - startProcessing throws when pipeline returns null", async (t) => {
  const client = createFakeRedisClient();
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      set: () => {},
      exec: sinon.fake.resolves(null)
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  try {
    await store.startProcessing("test-key", "test-fp", 60000);
    t.fail("should have thrown");
  } catch (err) {
    t.match(
      err.message,
      /pipeline failed/i,
      "should throw on null pipeline result"
    );
  }
  t.end();
});

test("RedisIdempotencyStore - startProcessing propagates a real driver error", async (t) => {
  const client = createFakeRedisClient();
  const driverError = new Error("Connection is closed");
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      set: () => {},
      exec: sinon.fake.resolves([
        [driverError, undefined],
        [null, "OK"]
      ])
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  try {
    await store.startProcessing("test-key", "test-fp", 60000);
    t.fail("should have thrown");
  } catch (err) {
    t.equal(
      err,
      driverError,
      "should propagate the driver error, not a conflict"
    );
  }
  t.end();
});

test("RedisIdempotencyStore - startProcessing propagates a fingerprint-index driver error", async (t) => {
  const client = createFakeRedisClient();
  const fpError = new Error(
    "WRONGTYPE Operation against a key holding the wrong kind of value"
  );
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      set: () => {},
      exec: sinon.fake.resolves([
        [null, "OK"],
        [fpError, undefined]
      ])
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  try {
    await store.startProcessing("test-key", "test-fp", 60000);
    t.fail("should have thrown");
  } catch (err) {
    t.equal(
      err,
      fpError,
      "should propagate the fingerprint-index driver error"
    );
  }
  t.end();
});

test("RedisIdempotencyStore - startProcessing tolerates a missing fingerprint result slot", async (t) => {
  const client = createFakeRedisClient();
  sinon.replace(
    client,
    "pipeline",
    sinon.fake.returns({
      set: () => {},
      exec: sinon.fake.resolves([[null, "OK"]])
    })
  );
  t.teardown(() => sinon.restore());

  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing("test-key", "test-fp", 60000);
  t.pass("should not throw when the fingerprint result slot is absent");
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
