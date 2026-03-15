// packages/stores/sqlite/tests/sqlite.test.js
import { test } from "tap";
import { runStoreTests } from "../../../core/tests/store-adapter-suite.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import fs from "fs";

runStoreTests({
  name: "sqlite",
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});

test("sqlite -creates store with default path when no options provided", (t) => {
  const store = new SqliteIdempotencyStore();
  t.ok(store, "store should be created with default path");
  store.close();
  fs.unlinkSync("./idempotency.db");
  t.end();
});
