import { MysqlIdempotencyStore } from "../packages/stores/mysql/node-mysql.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createExpressApp,
  settle,
  startServer,
  stopServer
} from "./lib/express-harness.js";

const MODULE_NAME = "e2e.express-mysql";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

let tableCounter = 0;

/**
 * Create a store backed by a fresh, uniquely named table so each phase
 * (warmup and timed) starts with an empty table. Unlike the postgres
 * store, the mysql store does not create its table, so the DDL runs here
 * (same shape as tests/integration/shared/mysql-helpers.js initMysqlSchema).
 */
async function createStore() {
  tableCounter += 1;
  const tableName = `bench_mysql_${tableCounter}`;
  const store = new MysqlIdempotencyStore({
    host: "localhost",
    port: 3306,
    database: "test",
    user: "idempot",
    password: "idempot",
    tableName
  });
  await store.pool.query(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      \`key\` VARCHAR(255) PRIMARY KEY,
      fingerprint VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL,
      response_status INT,
      response_headers TEXT,
      response_body TEXT,
      expires_at BIGINT NOT NULL,
      INDEX idx_fingerprint (fingerprint),
      INDEX idx_expires_at (expires_at)
    )
  `);
  return store;
}

async function teardownStore(store) {
  await store.pool.query(`DROP TABLE IF EXISTS \`${store.tableName}\``);
  await store.close();
}

/**
 * End-to-end per-request overhead of the express middleware backed by a
 * live mysql store, measured over real HTTP (ephemeral port, undici
 * keep-alive). Same three timed paths as the other e2e modules; see
 * bench/lib/express-harness.js and e2e.express-sqlite.js for the
 * fresh-key body uniqueness rationale and lifecycle notes.
 *
 * Requires a reachable mysql on localhost:3306 with database `test` and
 * user `idempot`/`idempot` (same prerequisites as the integration tests).
 */
export default {
  name: "e2e.express-mysql",
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
