import * as fc from "fast-check";

const fcString = () => fc.string({ minLength: 1, maxLength: 50 });

/**
 * Run shared property-based tests for any store implementation
 * @param {Object} options
 * @param {string} options.name - Store name for test descriptions
 * @param {Function} options.createStore - Factory function to create store instance
 */
export function runPropertyTests(options) {
  const { name, createStore } = options;

  test(`${name} - lookup determinism (same inputs yield same outputs)`, async (t) => {
    await fc.assert(
      fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
        const store = createStore();
        await store.startProcessing(key, fingerprint, 60000);

        const result1 = await store.lookup(key, fingerprint);
        const result2 = await store.lookup(key, fingerprint);

        const byKeyEqual =
          (result1.byKey === null && result2.byKey === null) ||
          (result1.byKey !== null &&
            result2.byKey !== null &&
            result1.byKey.key === result2.byKey.key &&
            result1.byKey.fingerprint === result2.byKey.fingerprint);

        await store.close();
        return byKeyEqual;
      }),
      { numRuns: 100 }
    );
    t.pass("lookup determinism invariant holds");
  });

  test(`${name} - startProcessing idempotency`, async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fcString(),
        fcString(),
        fc.integer({ min: 1000, max: 60000 }),
        async (key, fingerprint, ttlMs) => {
          const store = createStore();
          await store.startProcessing(key, fingerprint, ttlMs);
          await store.startProcessing(key, fingerprint, ttlMs);
          await store.startProcessing(key, fingerprint, ttlMs);

          const result = await store.lookup(key, fingerprint);
          await store.close();
          return (
            result.byKey !== null &&
            result.byKey.key === key &&
            result.byKey.fingerprint === fingerprint
          );
        }
      ),
      { numRuns: 100 }
    );
    t.pass("startProcessing idempotency invariant holds");
  });

  test(`${name} - fingerprint lookup finds record`, async (t) => {
    await fc.assert(
      fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
        const store = createStore();
        await store.startProcessing(key, fingerprint, 60000);
        const result = await store.lookup("different-key", fingerprint);
        await store.close();
        return (
          result.byFingerprint !== null && result.byFingerprint.key === key
        );
      }),
      { numRuns: 100 }
    );
    t.pass("fingerprint lookup invariant holds");
  });

  test(`${name} - complete requires prior startProcessing`, async (t) => {
    await fc.assert(
      fc.asyncProperty(fcString(), async (key) => {
        const store = createStore();
        let threw = false;

        try {
          await store.complete(key, {
            status: 200,
            headers: { "content-type": "application/json" },
            body: '{"result":"ok"}'
          });
        } catch {
          threw = true;
        }

        await store.close();
        return threw;
      }),
      { numRuns: 100 }
    );
    t.pass("complete throws without record invariant holds");
  });

  test(`${name} - complete preserves response`, async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fcString(),
        fcString(),
        fc.integer({ min: 100, max: 599 }),
        async (key, fingerprint, status) => {
          const store = createStore();
          const response = {
            status,
            headers: { "content-type": "application/json", "x-custom": "test" },
            body: '{"message":"success"}'
          };

          await store.startProcessing(key, fingerprint, 60000);
          await store.complete(key, response);
          const result = await store.lookup(key, fingerprint);

          await store.close();
          return (
            result.byKey !== null &&
            result.byKey.status === "complete" &&
            result.byKey.response !== undefined &&
            result.byKey.response.status === status &&
            result.byKey.response.body === response.body
          );
        }
      ),
      { numRuns: 100 }
    );
    t.pass("complete preserves response invariant holds");
  });

  test(`${name} - multiple keys can share same fingerprint`, async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fcString(),
        fcString(),
        fcString(),
        fc.integer({ min: 1000, max: 60000 }),
        async (key1, key2, fingerprint, ttlMs) => {
          if (key1 === key2) return true;

          const store = createStore();
          await store.startProcessing(key1, fingerprint, ttlMs);
          await store.startProcessing(key2, fingerprint, ttlMs);

          const result1 = await store.lookup(key1, fingerprint);
          const result2 = await store.lookup(key2, fingerprint);

          await store.close();
          return (
            result1.byKey !== null &&
            result2.byKey !== null &&
            result1.byKey.key === key1 &&
            result2.byKey.key === key2
          );
        }
      ),
      { numRuns: 100 }
    );
    t.pass("multiple keys same fingerprint invariant holds");
  });

  test(`${name} - status transitions from processing to complete`, async (t) => {
    await fc.assert(
      fc.asyncProperty(fcString(), fcString(), async (key, fingerprint) => {
        const store = createStore();
        await store.startProcessing(key, fingerprint, 60000);
        const before = await store.lookup(key, fingerprint);

        await store.complete(key, {
          status: 200,
          headers: {},
          body: "done"
        });
        const after = await store.lookup(key, fingerprint);

        await store.close();
        return (
          before.byKey?.status === "processing" &&
          after.byKey?.status === "complete"
        );
      }),
      { numRuns: 100 }
    );
    t.pass("status transition invariant holds");
  });
}