import { test } from "tap";
import * as fc from "fast-check";
import { generateFingerprint } from "@idempot/core";

const toBody = (value) => JSON.stringify(value);

test("fingerprint - determinism (same input produces same output)", async (t) => {
  await fc.assert(
    fc.asyncProperty(fc.json(), async (json) => {
      const body = toBody(json);
      const fp1 = await generateFingerprint(body);
      const fp2 = await generateFingerprint(body);
      return fp1 === fp2;
    }),
    { numRuns: 100 }
  );
  t.pass("determinism invariant holds");
});

test("fingerprint - order independence (object key order doesn't matter)", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(fc.string(), fc.json()),
      async (obj) => {
        const entries = Object.entries(obj);
        if (entries.length === 0) return true;

        const body1 = toBody(obj);
        const body2 = toBody(
          Object.fromEntries(entries.sort(([a], [b]) => b.localeCompare(a)))
        );
        const fp1 = await generateFingerprint(body1);
        const fp2 = await generateFingerprint(body2);
        return fp1 === fp2;
      }
    ),
    { numRuns: 100 }
  );
  t.pass("order independence invariant holds");
});

test("fingerprint - exclusion invariance (excluded fields don't affect fingerprint)", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(fc.string(), fc.json()),
      fc.string({ minLength: 1 }),
      async (obj, excludedValue) => {
        const key = "excludedField";
        const obj1 = { ...obj, [key]: excludedValue };
        const obj2 = { ...obj, [key]: excludedValue + "_different" };

        const body1 = toBody(obj1);
        const body2 = toBody(obj2);
        const fp1 = await generateFingerprint(body1, [key]);
        const fp2 = await generateFingerprint(body2, [key]);
        return fp1 === fp2;
      }
    ),
    { numRuns: 100 }
  );
  t.pass("exclusion invariance holds");
});

test("fingerprint - different non-empty objects produce different fingerprints", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(fc.string(), fc.json()),
      fc.dictionary(fc.string(), fc.json()),
      async (obj1, obj2) => {
        const body1 = toBody(obj1);
        const body2 = toBody(obj2);
        if (body1 === body2) {
          return true;
        }
        const fp1 = await generateFingerprint(body1);
        const fp2 = await generateFingerprint(body2);
        return fp1 !== fp2;
      }
    ),
    { numRuns: 100 }
  );
  t.pass("different objects produce different fingerprints");
});
