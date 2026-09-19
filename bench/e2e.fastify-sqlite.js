import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";
import { createFastifyApp, send } from "./lib/fastify-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const state = {};
  state.store = new SqliteIdempotencyStore({ path: ":memory:" });
  state.app = createFastifyApp(state.store);
  return {
    send: (opts) => send(state.app, opts),
    close: async () => {
      try {
        await state.app.close();
      } finally {
        // The store is released even when the app close fails.
        await state.store.close();
      }
    }
  };
}

function createBaselineRun() {
  const app = createFastifyApp(null);
  return {
    send: (opts) => send(app, opts),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.fastify-sqlite",
  createRun,
  createBaselineRun,
  settleMs: 50
});
