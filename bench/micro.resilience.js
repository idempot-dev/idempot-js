import { withResilience } from "../packages/core/src/resilience.js";
import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";
import { createKeyFactory } from "./lib/keys.js";

const FINGERPRINT = "fp-bench-4f9d2c";
const TTL_MS = 60000;
const RESPONSE = {
  status: 200,
  headers: { "content-type": "application/json" },
  body: '{"ok":true}'
};

const nextKey = createKeyFactory(20);

// All timed fns below are real `async` arrows (see bench/README.md for why
// that classification matters).

function ensureStore(state) {
  if (!state.store) {
    state.store = new SqliteIdempotencyStore({ path: ":memory:" });
    state.wrapped = withResilience(state.store).store;
  }
  return state.store;
}

async function teardownStore(state) {
  if (state.store) {
    await state.store.close();
    state.store = null;
    state.wrapped = null;
  }
}

/**
 * State strategy (important — tinybench runs tasks concurrently, and runs
 * the warmup AND the timed phase for every task, each with its own
 * beforeAll/afterAll cycle):
 *
 * - Every task owns a PRIVATE state object (bare store + resilience-wrapped
 *   variant built once per phase), so concurrent tasks never share mutable
 *   state and the opossum wrapper is never constructed inside a timed
 *   region.
 * - afterAll closes and nulls the store. Hooks run once per phase (warmup,
 *   then timed), so each phase gets a fresh store and closing at the end of
 *   one phase cannot poison the next.
 * - Setup stays outside the timed region: lookup tasks seed their record in
 *   beforeAll; startProcessing tasks consume a module-wide unique-key
 *   counter so no timed call hits the duplicate-key error path; complete
 *   tasks create the record to complete in beforeEach (per iteration).
 * - Rows accumulate only inside a task's private store (bounded by
 *   iterations per phase; memory dies with the process).
 */
export default {
  name: "micro.resilience",
  register(bench) {
    // --- lookup: existing record, bare vs resilient -------------------
    {
      const bare = {};
      const key = nextKey("lookup");
      bench.add(
        "lookup (bare)",
        async () => {
          await bare.store.lookup(key, FINGERPRINT);
        },
        {
          beforeAll: async () => {
            const store = ensureStore(bare);
            await store.startProcessing(key, FINGERPRINT, TTL_MS);
          },
          afterAll: () => teardownStore(bare)
        }
      );

      const resilient = {};
      bench.add(
        "lookup (resilient)",
        async () => {
          await resilient.wrapped.lookup(key, FINGERPRINT);
        },
        {
          beforeAll: async () => {
            const store = ensureStore(resilient);
            await store.startProcessing(key, FINGERPRINT, TTL_MS);
          },
          afterAll: () => teardownStore(resilient)
        }
      );
    }

    // --- startProcessing: unique key per iteration --------------------
    {
      const bare = {};
      bench.add(
        "startProcessing (bare)",
        async () => {
          await bare.store.startProcessing(nextKey("sp"), FINGERPRINT, TTL_MS);
        },
        {
          beforeAll: async () => {
            ensureStore(bare);
          },
          afterAll: () => teardownStore(bare)
        }
      );

      const resilient = {};
      bench.add(
        "startProcessing (resilient)",
        async () => {
          await resilient.wrapped.startProcessing(
            nextKey("sp"),
            FINGERPRINT,
            TTL_MS
          );
        },
        {
          beforeAll: async () => {
            ensureStore(resilient);
          },
          afterAll: () => teardownStore(resilient)
        }
      );
    }

    // --- complete: record created per iteration in beforeEach ---------
    {
      const bare = {};
      let currentKey;
      bench.add(
        "complete (bare)",
        async () => {
          await bare.store.complete(currentKey, RESPONSE);
        },
        {
          beforeEach: async () => {
            const store = ensureStore(bare);
            currentKey = nextKey("cm");
            await store.startProcessing(currentKey, FINGERPRINT, TTL_MS);
          },
          afterAll: () => teardownStore(bare)
        }
      );

      const resilient = {};
      let currentResilientKey;
      bench.add(
        "complete (resilient)",
        async () => {
          await resilient.wrapped.complete(currentResilientKey, RESPONSE);
        },
        {
          beforeEach: async () => {
            const store = ensureStore(resilient);
            currentResilientKey = nextKey("cm");
            await store.startProcessing(
              currentResilientKey,
              FINGERPRINT,
              TTL_MS
            );
          },
          afterAll: () => teardownStore(resilient)
        }
      );
    }
  }
};
