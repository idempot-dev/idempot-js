import { test } from "tap";
import { MemoryIdempotencyStore } from "../src/store/memory.js";

test("MemoryIdempotencyStore - initialization", async (t) => {
  const store = new MemoryIdempotencyStore();
  t.ok(store, "store should be created");
});
