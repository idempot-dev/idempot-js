import { describe, test, expect, beforeEach } from "bun:test";
import { BunSqliteIdempotencyStore } from "../../src/store/bun-sqlite.js";

describe("BunSqliteIdempotencyStore", () => {
  let store: BunSqliteIdempotencyStore;

  beforeEach(() => {
    store = new BunSqliteIdempotencyStore({ path: ":memory:" });
  });

  describe("initialization", () => {
    test("creates store with default path", () => {
      const defaultStore = new BunSqliteIdempotencyStore();
      expect(defaultStore).toBeDefined();
      defaultStore.close();
    });

    test("creates store with custom path", () => {
      const customStore = new BunSqliteIdempotencyStore({
        path: ":memory:"
      });
      expect(customStore).toBeDefined();
      customStore.close();
    });

    test("creates store with memory database", () => {
      expect(store).toBeDefined();
    });
  });

  describe("lookup", () => {
    test("returns null for non-existent key", async () => {
      const result = await store.lookup("non-existent", "fingerprint123");

      expect(result.byKey).toBeNull();
      expect(result.byFingerprint).toBeNull();
    });

    test("finds record by key after insert", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      const result = await store.lookup("key1", "fp1");

      expect(result.byKey).not.toBeNull();
      expect(result.byKey?.key).toBe("key1");
      expect(result.byKey?.fingerprint).toBe("fp1");
      expect(result.byKey?.status).toBe("processing");
    });

    test("finds record by fingerprint", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      const result = await store.lookup("different-key", "fp1");

      expect(result.byFingerprint).not.toBeNull();
      expect(result.byFingerprint?.fingerprint).toBe("fp1");
    });

    test("cleans up expired records during lookup", async () => {
      await store.startProcessing("expired-key", "fp1", -1000);

      const result = await store.lookup("expired-key", "fp1");

      expect(result.byKey).toBeNull();
    });
  });

  describe("startProcessing", () => {
    test("creates processing record", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      const result = await store.lookup("key1", "fp1");

      expect(result.byKey).not.toBeNull();
      expect(result.byKey?.status).toBe("processing");
      expect(result.byKey?.response).toBeUndefined();
    });

    test("stores correct expiration time", async () => {
      const ttlMs = 60000;
      const beforeTime = Date.now() + ttlMs;

      await store.startProcessing("key1", "fp1", ttlMs);

      const result = await store.lookup("key1", "fp1");
      const afterTime = Date.now() + ttlMs;

      expect(result.byKey?.expiresAt).toBeGreaterThanOrEqual(beforeTime);
      expect(result.byKey?.expiresAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe("complete", () => {
    test("updates record to complete with response", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      await store.complete("key1", {
        status: 201,
        headers: { "content-type": "application/json" },
        body: '{"id":"123"}'
      });

      const result = await store.lookup("key1", "fp1");

      expect(result.byKey?.status).toBe("complete");
      expect(result.byKey?.response).not.toBeUndefined();
      expect(result.byKey?.response?.status).toBe(201);
      expect(result.byKey?.response?.headers).toEqual({
        "content-type": "application/json"
      });
      expect(result.byKey?.response?.body).toBe('{"id":"123"}');
    });

    test("throws error for non-existent key", async () => {
      await expect(
        store.complete("non-existent", {
          status: 200,
          headers: {},
          body: ""
        })
      ).rejects.toThrow("No record found for key: non-existent");
    });
  });

  describe("cleanup", () => {
    test("removes expired records", async () => {
      await store.startProcessing("expired1", "fp1", -1000);
      await store.startProcessing("expired2", "fp2", -1000);
      await store.startProcessing("active", "fp3", 60000);

      await store.cleanup();

      const expired1 = await store.lookup("expired1", "fp1");
      const expired2 = await store.lookup("expired2", "fp2");
      const active = await store.lookup("active", "fp3");

      expect(expired1.byKey).toBeNull();
      expect(expired2.byKey).toBeNull();
      expect(active.byKey).not.toBeNull();
    });

    test("keeps non-expired records", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      await store.cleanup();

      const result = await store.lookup("key1", "fp1");

      expect(result.byKey).not.toBeNull();
    });
  });

  describe("close", () => {
    test("closes database connection", () => {
      const tempStore = new BunSqliteIdempotencyStore({ path: ":memory:" });

      expect(() => tempStore.close()).not.toThrow();
    });
  });

  describe("behavior parity with SqliteIdempotencyStore", () => {
    test("handles complex response data", async () => {
      await store.startProcessing("key1", "fp1", 60000);

      const complexResponse = {
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-custom-header": "value",
          "cache-control": "no-cache"
        },
        body: JSON.stringify({
          id: "order-123",
          items: [{ name: "widget", qty: 5 }],
          total: 100.5
        })
      };

      await store.complete("key1", complexResponse);

      const result = await store.lookup("key1", "fp1");

      expect(result.byKey?.response?.status).toBe(201);
      expect(result.byKey?.response?.headers).toEqual(complexResponse.headers);
      expect(result.byKey?.response?.body).toBe(complexResponse.body);
    });

    test("handles multiple concurrent operations", async () => {
      const operations = [];

      for (let i = 0; i < 10; i++) {
        operations.push(store.startProcessing(`key${i}`, `fp${i}`, 60000));
      }

      await Promise.all(operations);

      for (let i = 0; i < 10; i++) {
        const result = await store.lookup(`key${i}`, `fp${i}`);
        expect(result.byKey).not.toBeNull();
      }
    });
  });
});
