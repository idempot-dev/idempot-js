import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";
import {
  createExpressApp,
  startServer,
  stopServer
} from "./lib/express-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const { server, send } = await startServer(createExpressApp(store));
  return {
    send,
    close: async () => {
      try {
        await stopServer(server);
      } finally {
        // The store is released even when the server close fails.
        await store.close();
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
  name: "e2e.express-sqlite",
  createRun,
  createBaselineRun,
  settleMs: 50
});
