import { test } from "tap";
import { SqliteIdempotencyStore } from "../src/store/sqlite.js";

test("SqliteIdempotencyStore - initialization", (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  t.ok(store, "store should be created");
  store.close();
  t.end();
});
