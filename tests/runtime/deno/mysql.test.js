import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MysqlIdempotencyStore } from "../../../packages/stores/mysql/deno-mysql.js";

Deno.test(
  "MysqlIdempotencyStore (Deno) can start and complete processing",
  async () => {
    const store = new MysqlIdempotencyStore({ testMode: true });

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

    store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) complete throws on missing key",
  async () => {
    const store = new MysqlIdempotencyStore({ testMode: true });

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

    store.close();
  }
);

Deno.test(
  "MysqlIdempotencyStore (Deno) lookup finds by fingerprint",
  async () => {
    const store = new MysqlIdempotencyStore({ testMode: true });

    await store.startProcessing("key1", "fp-shared", 60000);

    const result = await store.lookup("key2", "fp-shared");
    assertEquals(result.byKey, null);
    assertEquals(result.byFingerprint?.key, "key1");

    store.close();
  }
);

Deno.test("MysqlIdempotencyStore (Deno) stores response headers", async () => {
  const store = new MysqlIdempotencyStore({ testMode: true });

  await store.startProcessing("key1", "fp1", 60000);
  await store.complete("key1", {
    status: 201,
    headers: { "x-custom": "value", "content-type": "text/plain" },
    body: "created"
  });

  const result = await store.lookup("key1", "fp1");
  assertEquals(result.byKey?.response?.headers?.["x-custom"], "value");
  assertEquals(result.byKey?.response?.headers?.["content-type"], "text/plain");

  store.close();
});
