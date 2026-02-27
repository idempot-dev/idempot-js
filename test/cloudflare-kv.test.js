import { describe, it } from "node:test";
import assert from "node:assert";
import { CloudflareKvIdempotencyStore } from "../src/store/cloudflare-kv.js";

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
      put: async (key, value) => { storeMap.set(JSON.stringify(key), value); },
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
      put: async (key, value) => { storeMap.set(JSON.stringify(key), value); },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });
    
    await store.startProcessing("key-1", "fp-1", 60000);
    
    const response = { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
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
      put: async (key, value) => { storeMap.set(JSON.stringify(key), value); },
      list: async function* () {}
    };
    const store = new CloudflareKvIdempotencyStore({ kv: mockKv });
    
    await store.startProcessing("key-1", "fp-1", 60000);
    
    // Lookup by fingerprint (different key, same fingerprint)
    const result = await store.lookup("different-key", "fp-1");
    assert.strictEqual(result.byFingerprint.key, "key-1");
  });
});
