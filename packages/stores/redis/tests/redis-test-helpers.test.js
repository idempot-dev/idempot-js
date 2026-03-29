import { test } from "tap";
import { createFakeRedisClient } from "./redis-test-helpers.js";

test("createFakeRedisClient - del returns 0 for non-existent key", async (t) => {
  const client = createFakeRedisClient();
  const result = await client.del("nonexistent");
  t.equal(result, 0, "should return 0 for non-existent key");
  t.end();
});

test("createFakeRedisClient - del returns 1 for existing key", async (t) => {
  const client = createFakeRedisClient();
  await client.setex("test-key", 60, "test-value");
  const result = await client.del("test-key");
  t.equal(result, 1, "should return 1 for existing key");
  t.end();
});

test("createFakeRedisClient - ttl returns -2 for non-existent key", async (t) => {
  const client = createFakeRedisClient();
  const ttl = await client.ttl("nonexistent");
  t.equal(ttl, -2, "should return -2 for non-existent key");
  t.end();
});

test("createFakeRedisClient - ttl returns remaining seconds for existing key", async (t) => {
  const client = createFakeRedisClient();
  await client.setex("test-key", 60, "test-value");
  const ttl = await client.ttl("test-key");
  t.ok(ttl > 0 && ttl <= 60, "should return remaining seconds");
  t.end();
});

test("createFakeRedisClient - get returns null for non-existent key", async (t) => {
  const client = createFakeRedisClient();
  const result = await client.get("nonexistent");
  t.equal(result, null, "should return null for non-existent key");
  t.end();
});

test("createFakeRedisClient - get returns value for existing key", async (t) => {
  const client = createFakeRedisClient();
  await client.setex("test-key", 60, "test-value");
  const result = await client.get("test-key");
  t.equal(result, "test-value", "should return value for existing key");
  t.end();
});

test("createFakeRedisClient - ttl returns -2 for expired key", async (t) => {
  const client = createFakeRedisClient();
  await client.setex("test-key", 60, "test-value");
  const store = client.__store;
  store.expiryTimers.set("test-key", Date.now() - 1000);
  const ttl = await client.ttl("test-key");
  t.equal(ttl, -2, "should return -2 for expired key");
  t.end();
});

test("createFakeRedisClient - ttl returns -2 for expired key", async (t) => {
  const client = createFakeRedisClient();
  // Set a key with past expiry by manipulating internal store
  await client.setex("test-key", 60, "test-value");
  const store = client.__store;
  store.expiryTimers.set("test-key", Date.now() - 1000);
  const ttl = await client.ttl("test-key");
  t.equal(ttl, -2, "should return -2 for expired key");
  t.end();
});
