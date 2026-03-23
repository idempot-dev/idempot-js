import { test } from "tap";

// Skip all tests in Node.js since bun:sqlite is only available in Bun runtime
// The actual tests are in runtime-tests/bun/
test("BunSqliteIdempotencyStore - skipped in Node.js", (t) => {
  t.pass("Bun-specific tests are in runtime-tests/bun/");
  t.end();
});
