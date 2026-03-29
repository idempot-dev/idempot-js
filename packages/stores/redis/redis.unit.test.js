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

test("RedisIdempotencyStore - lookup returns null for empty store", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
  t.end();
});

test("RedisIdempotencyStore - lookup finds record by key", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.key, "key-1", "should find by key");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.end();
});

test("RedisIdempotencyStore - lookup finds record by fingerprint", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

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

test("RedisIdempotencyStore - startProcessing creates record", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.fingerprint, "fp-1", "fingerprint should be stored");
  t.end();
});

test("RedisIdempotencyStore - complete updates record", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

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

test("RedisIdempotencyStore - complete throws on missing key", async (t) => {
  const client = createFakeRedisClient();
  const store = new RedisIdempotencyStore({ client });

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
