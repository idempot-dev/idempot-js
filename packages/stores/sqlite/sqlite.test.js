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
