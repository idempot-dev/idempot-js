// packages/stores/sqlite/sqlite.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds SQLite-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
import { test } from "tap";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import fs from "fs";
import os from "os";
import path from "path";

runStoreTests({
  name: "sqlite",
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});

test("sqlite - does not return expired records", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  // Negative TTL inserts an already-expired record; the purge may reclaim
  // it and the expiry guard must hide it either way.
  await store.startProcessing("expired-key", "expired-fp", -1000);

  const byKey = await store.lookup("expired-key", "other-fp");
  t.equal(byKey.byKey, null, "expired record should not be found by key");

  await store.startProcessing("expired-key-2", "expired-fp-2", -1000);
  const byFingerprint = await store.lookup("other-key", "expired-fp-2");
  t.equal(
    byFingerprint.byFingerprint,
    null,
    "expired record should not be found by fingerprint"
  );

  store.close();
  t.end();
});

test("sqlite - creates store with default path when no options provided", (t) => {
  // This file is also discovered through workspace node_modules symlinks,
  // so several copies can run concurrently and share the project cwd. Run
  // in a private cwd: the store's default path is "./idempotency.db"
  // relative to cwd, and a fixed filename in a shared cwd races between
  // workers.
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-default-"));
  const originalCwd = process.cwd();
  process.chdir(workdir);
  try {
    const store = new SqliteIdempotencyStore();
    t.ok(store, "store should be created with default path");
    store.close();
    t.ok(
      fs.existsSync(path.join(workdir, "idempotency.db")),
      "default file should be created in the current working directory"
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(workdir, { recursive: true, force: true });
  }
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
