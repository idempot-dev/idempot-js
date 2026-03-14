import { test } from "tap";
import * as fc from "fast-check";
import { validateIdempotencyKey, validateExcludeFields } from "@idempot/core";

test("validation - key length boundaries", async (t) => {
  await fc.assert(
    fc.property(fc.integer({ min: 1, max: 300 }), (len) => {
      const key = "x".repeat(len);
      const result = validateIdempotencyKey(key, {
        minKeyLength: 21,
        maxKeyLength: 255
      });
      const shouldBeValid = len >= 21 && len <= 255 && !key.includes(",");
      return result.valid === shouldBeValid;
    }),
    { numRuns: 200 }
  );
  t.pass("key length boundary invariant holds");
});

test("validation - comma rejection", async (t) => {
  await fc.assert(
    fc.property(
      fc.string({ minLength: 21, maxLength: 50 }),
      fc.integer({ min: 0, max: 49 }),
      (base, pos) => {
        const key = base.slice(0, pos) + "," + base.slice(pos);
        const result = validateIdempotencyKey(key);
        return !result.valid;
      }
    ),
    { numRuns: 100 }
  );
  t.pass("comma rejection invariant holds");
});

test("validation - exclude fields accepts strings/null/undefined", async (t) => {
  await fc.assert(
    fc.property(
      fc.array(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        { maxLength: 20 }
      ),
      (fields) => {
        try {
          validateExcludeFields(fields);
          return true;
        } catch {
          return false;
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("exclude fields accepts valid types");
});

test("validation - exclude fields rejects non-string primitives", async (t) => {
  await fc.assert(
    fc.property(
      fc.array(
        fc.oneof(fc.integer(), fc.boolean(), fc.constant({}), fc.constant([])),
        {
          minLength: 1,
          maxLength: 5
        }
      ),
      (fields) => {
        try {
          validateExcludeFields(fields);
          return false;
        } catch {
          return true;
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("exclude fields rejects invalid types");
});
