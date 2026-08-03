// packages/stores/sqlite/sqlite.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds SQLite-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
import { test } from "tap";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import fs from "fs";

runStoreTests({
  name: "sqlite",
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});

test("sqlite - creates store with default path when no options provided", (t) => {
  const store = new SqliteIdempotencyStore();
  t.ok(store, "store should be created with default path");
  store.close();
  fs.unlinkSync("./idempotency.db");
  t.end();
});

test("sqlite - startProcessing on existing key throws IdempotencyKeyExistsError", async (t) => {
  const { IdempotencyKeyExistsError } = await import("@idempot/core");
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  await store.startProcessing("dup-key", "fp-1", 60000);

  await t.rejects(
    store.startProcessing("dup-key", "fp-2", 60000),
    IdempotencyKeyExistsError,
    "duplicate insert should throw IdempotencyKeyExistsError"
  );

  store.close();
  t.end();
});

test("sqlite - startProcessing propagates non-constraint driver errors", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  // A NOT NULL violation (fingerprint undefined) is a SQLITE_CONSTRAINT_NOTNULL
  // error, not the PRIMARY KEY constraint; it must propagate unchanged.
  await t.rejects(
    store.startProcessing("fresh-key", undefined, 60000),
    /NOT NULL/,
    "non-key constraint errors propagate unchanged"
  );

  store.close();
  t.end();
});
