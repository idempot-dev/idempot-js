import { describe, it } from "node:test";
import assert from "node:assert";
import { CloudflareKvIdempotencyStore } from "@idempot/cloudflare-kv-store";

describe("CloudflareKvIdempotencyStore", () => {
  it("should require KV namespace", () => {
    assert.throws(
      () => new CloudflareKvIdempotencyStore({}),
      /KV namespace is required/
    );
  });

  it("should lookup and return null for missing keys", async () => {
    const mockKv = {
      get: async () => null,
      put: async () => {},
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    const result = await store.lookup("test-key", "test-fp");
    assert.strictEqual(result.byKey, null);
    assert.strictEqual(result.byFingerprint, null);
  });

  it("should store and retrieve a processing record", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await store.startProcessing("key-1", "fp-1", 60000);

    const result = await store.lookup("key-1", "fp-1");
    assert.strictEqual(result.byKey.status, "processing");
    assert.strictEqual(result.byKey.fingerprint, "fp-1");
  });

  it("should complete a processing record", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await store.startProcessing("key-1", "fp-1", 60000);

    const response = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}'
    };
    await store.complete("key-1", response);

    const result = await store.lookup("key-1", "fp-1");
    assert.strictEqual(result.byKey.status, "complete");
    assert.deepStrictEqual(result.byKey.response, response);
  });

  it("should throw when completing missing record", async () => {
    const mockKv = {
      get: async () => null,
      put: async () => {},
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await assert.rejects(
      () => store.complete("missing", { status: 200, headers: {}, body: "" }),
      /No record found/
    );
  });

  it("should handle fingerprint lookups", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await store.startProcessing("key-1", "fp-1", 60000);

    // Lookup by fingerprint (different key, same fingerprint)
    const result = await store.lookup("different-key", "fp-1");
    assert.strictEqual(result.byFingerprint.key, "key-1");
  });

  it("should handle missing record when looking up by fingerprint", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();
    // Store fingerprint pointing to key, but the key record is missing (race condition)
    storeMap.set(
      JSON.stringify(["idempotency", "fp", "orphaned-fp"]),
      "orphaned-key"
    );

    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    // Lookup by fingerprint where the record was deleted
    const result = await store.lookup("different-key", "orphaned-fp");
    assert.strictEqual(result.byFingerprint, null);
  });

  it("should throw when completing expired record", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();
    // Pre-store an expired record
    const expiredRecord = {
      key: "expired-key",
      fingerprint: "expired-fp",
      status: "processing",
      expiresAt: Date.now() - 1000 // Already expired
    };
    storeMap.set(
      JSON.stringify(["idempotency", "expired-key"]),
      JSON.stringify(expiredRecord)
    );

    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await assert.rejects(
      () =>
        store.complete("expired-key", { status: 200, headers: {}, body: "" }),
      /Record expired/
    );
  });

  it("should cleanup expired records", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();

    // Pre-store an expired record
    const expiredRecord = {
      key: "expired-key",
      fingerprint: "expired-fp",
      status: "complete",
      expiresAt: Date.now() - 1000,
      response: { status: 200, headers: {}, body: "" }
    };
    storeMap.set(
      JSON.stringify(["idempotency", "expired-key"]),
      JSON.stringify(expiredRecord)
    );
    // Fingerprint entry stores the key
    storeMap.set(
      JSON.stringify(["idempotency", "fp", "expired-fp"]),
      "expired-key"
    );

    let deletedKeys = [];
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      delete: async (key) => {
        deletedKeys.push(key);
      },
      list: async function* () {
        for (const k of storeMap.keys()) {
          const parsed = JSON.parse(k);
          if (parsed[0] === "idempotency" && parsed[1] === "fp") {
            yield { key: parsed };
          }
        }
      }
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await store.cleanup();

    assert.strictEqual(deletedKeys.length, 1);
  });

  it("should not delete non-expired records during cleanup", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();

    // Pre-store a valid (non-expired) record
    const validRecord = {
      key: "valid-key",
      fingerprint: "valid-fp",
      status: "complete",
      expiresAt: Date.now() + 60000,
      response: { status: 200, headers: {}, body: "" }
    };
    storeMap.set(
      JSON.stringify(["idempotency", "valid-key"]),
      JSON.stringify(validRecord)
    );
    storeMap.set(
      JSON.stringify(["idempotency", "fp", "valid-fp"]),
      "valid-key"
    );

    let deletedKeys = [];
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      delete: async (key) => {
        deletedKeys.push(key);
      },
      list: async function* () {
        for (const k of storeMap.keys()) {
          const parsed = JSON.parse(k);
          if (parsed[0] === "idempotency" && parsed[1] === "fp") {
            yield { key: parsed };
          }
        }
      }
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    await store.cleanup();

    assert.strictEqual(deletedKeys.length, 0);
  });

  it("should handle missing record during cleanup gracefully", async () => {
    /** @type {Map<string, string>} */
    const storeMap = new Map();

    // Store fingerprint reference but no actual record (race condition)
    storeMap.set(
      JSON.stringify(["idempotency", "fp", "missing-fp"]),
      "missing-key"
    );

    let deletedKeys = [];
    const mockKv = {
      get: async (key) => storeMap.get(JSON.stringify(key)) ?? null,
      put: async (key, value) => {
        storeMap.set(JSON.stringify(key), value);
      },
      delete: async (key) => {
        deletedKeys.push(key);
      },
      list: async function* () {
        for (const k of storeMap.keys()) {
          const parsed = JSON.parse(k);
          if (parsed[0] === "idempotency" && parsed[1] === "fp") {
            yield { key: parsed };
          }
        }
      }
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });

    // Should not throw
    await store.cleanup();
    assert.strictEqual(deletedKeys.length, 0);
  });
});
