import { test } from "tap";
import { idempotency } from "../src/middleware-express.js";

test("middleware-express - exports idempotency function", async (t) => {
  t.type(idempotency, "function");
});
