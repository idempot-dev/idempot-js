import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MysqlIdempotencyStore } from "../../../packages/stores/mysql/deno-mysql.js";
import { createFakeMysqlClient } from "./mysql-test-helpers.js";

Deno.test(
  "MysqlIdempotencyStore (Deno) can start and complete processing",
  async () => {
    const client = createFakeMysqlClient();
    const store = new MysqlIdempotencyStore({});
    store.client = client;

    await store.startProcessing("key1", "fingerprint1", 60000);

    const result = await store.lookup("key1", "fingerprint1");
    assertEquals(result.byKey?.status, "processing");

    await store.complete("key1", {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"success":true}'
    });

    const completed = await store.lookup("key1", "fingerprint1");
    assertEquals(completed.byKey?.status, "complete");
    assertEquals(completed.byKey?.response?.status, 200);

    await store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) complete throws on missing key",
  async () => {
    const client = createFakeMysqlClient();
    const store = new MysqlIdempotencyStore({});
    store.client = client;

    try {
      await store.complete("nonexistent", {
        status: 200,
        headers: {},
        body: ""
      });
      throw new Error("Should have thrown");
    } catch (e) {
      assertEquals(e.message.includes("No record found"), true);
    }

    await store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) lookup returns null for empty store",
  async () => {
    const client = createFakeMysqlClient();
    const store = new MysqlIdempotencyStore({});
    store.client = client;

    const result = await store.lookup("key1", "fingerprint1");
    assertEquals(result.byKey, null);
    assertEquals(result.byFingerprint, null);

    await store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) lookup finds record by fingerprint",
  async () => {
    const client = createFakeMysqlClient();
    const store = new MysqlIdempotencyStore({});
    store.client = client;

    await store.startProcessing("key1", "shared-fingerprint", 60000);

    const result = await store.lookup("key2", "shared-fingerprint");
    assertEquals(result.byKey, null);
    assertEquals(result.byFingerprint?.key, "key1");
    assertEquals(result.byFingerprint?.fingerprint, "shared-fingerprint");

    await store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) parseRecord handles null response_headers",
  async () => {
    const client = createFakeMysqlClient();
    const store = new MysqlIdempotencyStore({});
    store.client = client;

    client.__store.set("test-key", {
      key: "test-key",
      fingerprint: "test-fp",
      status: "complete",
      response_status: 200,
      response_headers: null,
      response_body: '{"test":true}',
      expires_at: Date.now() + 60000
    });

    const result = await store.lookup("test-key", "test-fp");
    assertEquals(result.byKey?.response?.headers, {});

    await store.close();
  }
);
