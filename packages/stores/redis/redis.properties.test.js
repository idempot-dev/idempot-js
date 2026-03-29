import { test } from "tap";
import * as fc from "fast-check";
import { RedisIdempotencyStore } from "@idempot/redis-store";
import { createFakeRedisClient } from "./tests/redis-test-helpers.js";

const createStore = () => {
  const client = createFakeRedisClient();
  return new RedisIdempotencyStore({ client });
};

const fcString = () => fc.string({ minLength: 1, maxLength: 50 });

test("redis - lookup determinism (same inputs yield same outputs)", async (t) => {
  await fc.assert(
    fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
      const store = createStore();
      await store.startProcessing(key, fingerprint, 60000);

      const result1 = await store.lookup(key, fingerprint);
      const result2 = await store.lookup(key, fingerprint);

      const byKeyEqual =
        (result1.byKey === null && result2.byKey === null) ||
        (result1.byKey !== null &&
          result2.byKey !== null &&
          result1.byKey.key === result2.byKey.key &&
          result1.byKey.fingerprint === result2.byKey.fingerprint);

      const byFingerprintEqual =
        (result1.byFingerprint === null && result2.byFingerprint === null) ||
        (result1.byFingerprint !== null &&
          result2.byFingerprint !== null &&
          result1.byFingerprint.key === result2.byFingerprint.key);

      await store.close();
      return byKeyEqual && byFingerprintEqual;
    }),
    { numRuns: 100 }
  );
  t.pass("lookup determinism invariant holds");
});

test("redis - startProcessing idempotency", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fcString(),
      fcString(),
      fc.integer({ min: 1000, max: 60000 }),
      async (key, fingerprint, ttlMs) => {
        const store = createStore();

        await store.startProcessing(key, fingerprint, ttlMs);
        await store.startProcessing(key, fingerprint, ttlMs);
        await store.startProcessing(key, fingerprint, ttlMs);

        const result = await store.lookup(key, fingerprint);

        await store.close();
        return (
          result.byKey !== null &&
          result.byKey.key === key &&
          result.byKey.fingerprint === fingerprint
        );
      }
    ),
    { numRuns: 100 }
  );
  t.pass("startProcessing idempotency invariant holds");
});

test("redis - fingerprint lookup finds record", async (t) => {
  await fc.assert(
    fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
      const store = createStore();
      await store.startProcessing(key, fingerprint, 60000);

      const result = await store.lookup("different-key", fingerprint);

      await store.close();
      return result.byFingerprint !== null && result.byFingerprint.key === key;
    }),
    { numRuns: 100 }
  );
  t.pass("fingerprint lookup invariant holds");
});

test("redis - complete requires prior startProcessing", async (t) => {
  await fc.assert(
    fc.asyncProperty(fcString(), async (key) => {
      const store = createStore();
      let threw = false;

      try {
        await store.complete(key, {
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"result":"ok"}'
        });
      } catch {
        threw = true;
      }

      await store.close();
      return threw;
    }),
    { numRuns: 100 }
  );
  t.pass("complete throws without record invariant holds");
});

test("redis - complete preserves response", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fcString(),
      fcString(),
      fc.integer({ min: 100, max: 599 }),
      async (key, fingerprint, status) => {
        const store = createStore();
        const response = {
          status,
          headers: { "content-type": "application/json", "x-custom": "test" },
          body: '{"message":"success"}'
        };

        await store.startProcessing(key, fingerprint, 60000);
        await store.complete(key, response);

        const result = await store.lookup(key, fingerprint);

        await store.close();
        return (
          result.byKey !== null &&
          result.byKey.status === "complete" &&
          result.byKey.response !== undefined &&
          result.byKey.response.status === status &&
          result.byKey.response.body === response.body
        );
      }
    ),
    { numRuns: 100 }
  );
  t.pass("complete preserves response invariant holds");
});

test("redis - multiple keys can share same fingerprint", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fcString(),
      fcString(),
      fcString(),
      fc.string({ minLength: 1, maxLength: 5 }),
      async (key1, key2, fingerprint, ttlStr) => {
        if (key1 === key2) return true;

        const ttlMs = parseInt(ttlStr) || 1000;
        const store = createStore();
        await store.startProcessing(key1, fingerprint, ttlMs);
        await store.startProcessing(key2, fingerprint, ttlMs);

        const result1 = await store.lookup(key1, fingerprint);
        const result2 = await store.lookup(key2, fingerprint);

        await store.close();
        return (
          result1.byKey !== null &&
          result2.byKey !== null &&
          result1.byKey.key === key1 &&
          result2.byKey.key === key2 &&
          result1.byFingerprint !== null &&
          result2.byFingerprint !== null
        );
      }
    ),
    { numRuns: 100 }
  );
  t.pass("multiple keys same fingerprint invariant holds");
});

test("redis - status transitions from processing to complete", async (t) => {
  await fc.assert(
    fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
      const store = createStore();

      await store.startProcessing(key, fingerprint, 60000);
      const beforeComplete = await store.lookup(key, fingerprint);

      await store.complete(key, {
        status: 200,
        headers: {},
        body: "done"
      });
      const afterComplete = await store.lookup(key, fingerprint);

      await store.close();
      return (
        beforeComplete.byKey?.status === "processing" &&
        afterComplete.byKey?.status === "complete"
      );
    }),
    { numRuns: 100 }
  );
  t.pass("status transition invariant holds");
});
