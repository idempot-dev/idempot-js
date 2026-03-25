// packages/core/tests/store-adapter-suite.js
import { test } from "tap";

/**
 * @param {Object} adapter
 * @throws {Error} if adapter is invalid
 */
function validateAdapter(adapter) {
  if (!adapter.name || typeof adapter.name !== "string") {
    throw new Error("Adapter must have a 'name' string property");
  }
  if (typeof adapter.createStore !== "function") {
    throw new Error("Adapter must have a 'createStore' function");
  }
}

/**
 * Run shared store tests
 * Call this in your store test file to run the full test suite
 *
 * @param {Object} adapter
 * @param {string} adapter.name - Store name (e.g., "sqlite", "redis")
 * @param {Function} adapter.createStore - () => store instance
 */
export function runStoreTests(adapter) {
  validateAdapter(adapter);

  // Initialization
  test(`${adapter.name} - creates store`, (t) => {
    const store = adapter.createStore();
    t.ok(store, "store should be created");
    if (store.close) store.close();
    t.end();
  });

  // lookup - empty store
  test(`${adapter.name} - lookup returns null for empty store`, async (t) => {
    const store = adapter.createStore();
    const result = await store.lookup("test-key", "test-fp");
    t.equal(result.byKey, null, "byKey should be null");
    t.equal(result.byFingerprint, null, "byFingerprint should be null");
    if (store.close) await store.close();
    t.end();
  });

  // lookup - finds by key
  test(`${adapter.name} - lookup finds record by key`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    const result = await store.lookup("test-key", "test-fp");
    t.ok(result.byKey, "record should exist by key");
    t.equal(result.byKey.key, "test-key", "key should match");
    if (store.close) await store.close();
    t.end();
  });

  // lookup - finds by fingerprint
  test(`${adapter.name} - lookup finds record by fingerprint`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    const result = await store.lookup("different-key", "test-fp");
    t.ok(result.byFingerprint, "should find by fingerprint");
    t.equal(
      result.byFingerprint.fingerprint,
      "test-fp",
      "fingerprint should match"
    );
    if (store.close) await store.close();
    t.end();
  });

  // lookup - different key with matching fingerprint
  test(`${adapter.name} - lookup with different key and matching fingerprint`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("key-1", "fp-1", 60000);
    const result = await store.lookup("key-2", "fp-1");
    t.equal(result.byKey, null, "should not find by different key");
    t.ok(result.byFingerprint, "should find by matching fingerprint");
    if (store.close) await store.close();
    t.end();
  });

  // startProcessing - creates record
  test(`${adapter.name} - startProcessing creates record with processing status`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    const result = await store.lookup("test-key", "test-fp");
    t.equal(result.byKey.status, "processing", "status should be processing");
    if (store.close) await store.close();
    t.end();
  });

  // startProcessing - stores correct fingerprint
  test(`${adapter.name} - startProcessing stores correct fingerprint`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    const result = await store.lookup("test-key", "test-fp");
    t.equal(result.byKey.fingerprint, "test-fp", "fingerprint should match");
    if (store.close) await store.close();
    t.end();
  });

  // startProcessing - sets future expiration
  test(`${adapter.name} - startProcessing sets future expiration`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    const result = await store.lookup("test-key", "test-fp");
    t.ok(result.byKey.expiresAt > Date.now(), "should have future expiration");
    if (store.close) await store.close();
    t.end();
  });

  // complete - updates record
  test(`${adapter.name} - complete updates record to complete status`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    await store.complete("test-key", {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"result":"ok"}'
    });
    const result = await store.lookup("test-key", "test-fp");
    t.equal(result.byKey.status, "complete", "status should be complete");
    if (store.close) await store.close();
    t.end();
  });

  // complete - stores response
  test(`${adapter.name} - complete stores response`, async (t) => {
    const store = adapter.createStore();
    await store.startProcessing("test-key", "test-fp", 60000);
    await store.complete("test-key", {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"result":"ok"}'
    });
    const result = await store.lookup("test-key", "test-fp");
    t.ok(result.byKey.response, "response should be stored");
    t.equal(result.byKey.response.status, 200, "response status should match");
    t.same(result.byKey.response.headers, {
      "content-type": "application/json"
    });
    t.equal(result.byKey.response.body, '{"result":"ok"}');
    if (store.close) await store.close();
    t.end();
  });

  // complete - throws on missing key
  test(`${adapter.name} - complete throws on missing key`, async (t) => {
    const store = adapter.createStore();
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
        /No record found/,
        "should throw error for missing key"
      );
    }
    if (store.close) await store.close();
    t.end();
  });
}
