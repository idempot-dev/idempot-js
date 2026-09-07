import { PostgresIdempotencyStore } from "../packages/stores/postgres/index.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createExpressApp,
  settle,
  startServer,
  stopServer
} from "./lib/express-harness.js";

const MODULE_NAME = "e2e.express-postgres";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

let schemaCounter = 0;

/**
 * Create a store in a fresh, uniquely named schema so each phase (warmup
 * and timed) starts with an empty table. The store's constructor fires
 * initSchema() without awaiting it, so poll until the table answers.
 */
async function createStore() {
  schemaCounter += 1;
  const store = new PostgresIdempotencyStore({
    host: "localhost",
    port: 5432,
    database: "test",
    user: "idempot",
    password: "idempot",
    schema: `bench_pg_${schemaCounter}`
  });
  for (let i = 0; i < 50; i++) {
    try {
      await store.pool.query(
        `SELECT 1 FROM ${store.quotedSchemaIdentifier}.idempotency_records LIMIT 1`
      );
      return store;
    } catch {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  throw new Error(
    `idempotency_records table not ready for schema bench_pg_${schemaCounter} after 1s`
  );
}

async function teardownStore(store) {
  await store.pool.query(
    `DROP SCHEMA IF EXISTS ${store.quotedSchemaIdentifier} CASCADE`
  );
  await store.close();
}

/**
 * End-to-end per-request overhead of the express middleware backed by a
 * live postgres store, measured over real HTTP (ephemeral port, undici
 * keep-alive). Same three timed paths as the other e2e modules; see
 * bench/lib/express-harness.js and e2e.express-sqlite.js for the
 * fresh-key body uniqueness rationale and lifecycle notes.
 *
 * Requires a reachable postgres on localhost:5432 with database `test`
 * and user `idempot`/`idempot` (same prerequisites as the integration
 * tests).
 */
export default {
  name: "e2e.express-postgres",
  register(bench) {
    const state = {};
    bench.add(
      FRESH_KEY_TASK,
      async () => {
        const status = await state.send({
          key: nextKey("key"),
          body: nextBody()
        });
        if (status !== 200) {
          throw new Error(
            `middleware fresh-key request failed: HTTP ${status}`
          );
        }
      },
      {
        beforeAll: async () => {
          state.store = await createStore();
          const { server, send } = await startServer(
            createExpressApp(state.store)
          );
          state.server = server;
          state.send = send;
          const status = await send({ key: nextKey("key"), body: nextBody() });
          if (status !== 200) {
            throw new Error(
              `middleware fresh-key request failed: HTTP ${status}`
            );
          }
        },
        afterAll: async () => {
          await stopServer(state.server);
          await teardownStore(state.store);
          state.store = null;
        }
      }
    );

    const repeatState = {};
    const repeatKey = nextKey("key");
    bench.add(
      REPEAT_KEY_TASK,
      async () => {
        const status = await repeatState.send({ key: repeatKey });
        if (status !== 200) {
          throw new Error(
            `middleware repeat-key request failed: HTTP ${status}`
          );
        }
      },
      {
        beforeAll: async () => {
          repeatState.store = await createStore();
          const { server, send } = await startServer(
            createExpressApp(repeatState.store)
          );
          repeatState.server = server;
          repeatState.send = send;
          const status = await send({ key: repeatKey });
          if (status !== 200) {
            throw new Error(
              `middleware repeat-key request failed: HTTP ${status}`
            );
          }
          await settle();
        },
        afterAll: async () => {
          await stopServer(repeatState.server);
          await teardownStore(repeatState.store);
          repeatState.store = null;
        }
      }
    );

    bench.add(
      BASELINE_TASK,
      async () => {
        const status = await state.baselineSend();
        if (status !== 200) {
          throw new Error(`baseline request failed: HTTP ${status}`);
        }
      },
      {
        beforeAll: async () => {
          const { server, send } = await startServer(createExpressApp(null));
          state.baselineServer = server;
          state.baselineSend = send;
        },
        afterAll: async () => {
          await stopServer(state.baselineServer);
          state.baselineSend = null;
        }
      }
    );
  },

  /**
   * Derive the overhead metrics from this module's aggregated results.
   * Receives rows of { module, task, median_ops_s, median_ms, rme_pct }.
   */
  derive(moduleResults) {
    const fresh = moduleResults.find((row) => row.task === FRESH_KEY_TASK);
    const baseline = moduleResults.find((row) => row.task === BASELINE_TASK);
    if (!fresh || !baseline || !baseline.median_ms) {
      return [];
    }
    const deltaMs = fresh.median_ms - baseline.median_ms;
    return [
      { name: `${MODULE_NAME}.overhead_delta_ms`, value: deltaMs },
      {
        name: `${MODULE_NAME}.overhead_pct`,
        value: (deltaMs / baseline.median_ms) * 100
      }
    ];
  }
};
