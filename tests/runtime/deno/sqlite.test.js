import {
  assertEquals,
  assertRejects
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DenoSqliteIdempotencyStore } from "../../../packages/stores/sqlite/deno-sqlite.js";
import { IdempotencyKeyExistsError } from "../../../packages/core/src/errors.js";

Deno.test(
  "DenoSqliteIdempotencyStore startProcessing propagates non-constraint driver errors unchanged",
  async () => {
    const store = new DenoSqliteIdempotencyStore({ path: ":memory:" });

    // A NOT NULL violation (fingerprint undefined) is a constraint error with
    // the same driver code (19) as a duplicate key, so it must not be
    // translated into IdempotencyKeyExistsError.
    try {
      await store.startProcessing("fresh-key", undefined, 60000);
      throw new Error("Should have thrown");
    } catch (e) {
      assertEquals(e instanceof IdempotencyKeyExistsError, false);
      assertEquals(e.message.includes("NOT NULL"), true);
    }

    store.close();
  }
);

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
  "DenoSqliteIdempotencyStore startProcessing throws IdempotencyKeyExistsError on duplicate key",
  async () => {
    const store = new DenoSqliteIdempotencyStore({ path: ":memory:" });

    await store.startProcessing("dup-key", "fingerprint1", 60000);

    await assertRejects(
      () => store.startProcessing("dup-key", "fingerprint2", 60000),
      IdempotencyKeyExistsError
    );

    store.close();
  }
);
