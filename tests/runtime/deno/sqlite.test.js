import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DenoSqliteIdempotencyStore } from "../../../packages/stores/sqlite/deno-sqlite.js";

Deno.test(
  "DenoSqliteIdempotencyStore can start and complete processing",
  async () => {
    const store = new DenoSqliteIdempotencyStore({ path: ":memory:" });

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
  "DenoSqliteIdempotencyStore complete throws on missing key",
  async () => {
    const store = new DenoSqliteIdempotencyStore({ path: ":memory:" });

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
