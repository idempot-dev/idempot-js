import { MysqlIdempotencyStore } from "../packages/stores/mysql/node-mysql.js";
import {
  createExpressApp,
  startServer,
  stopServer
} from "./lib/express-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

let tableCounter = 0;

/**
 * Create a store backed by a fresh, uniquely named table so each phase
 * (warmup and timed) starts with an empty table. Unlike the postgres
 * store, the mysql store does not create its table, so the DDL runs here
 * (same shape as tests/integration/shared/mysql-helpers.js initMysqlSchema).
 */
async function createStore() {
  tableCounter += 1;
  // The pid namespaces the table so concurrent suite runs on one
  // machine cannot drop each other's tables mid-phase.
  const tableName = `bench_mysql_${process.pid}_${tableCounter}`;
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
  try {
    await store.pool.query(`DROP TABLE IF EXISTS \`${store.tableName}\``);
  } finally {
    // The pool is released even when the DROP fails (lost connection).
    await store.close();
  }
}

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const store = await createStore();
  const { server, send } = await startServer(createExpressApp(store));
  return {
    send,
    close: async () => {
      try {
        await stopServer(server);
      } finally {
        await teardownStore(store);
      }
    }
  };
}

async function createBaselineRun() {
  const { server, send } = await startServer(createExpressApp(null));
  return {
    send,
    close: () => stopServer(server)
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.express-mysql",
  createRun,
  createBaselineRun,
  settleMs: 50
});
