import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { createHandler, send } from "./lib/bun-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const state = {};
  state.store = new BunSqlIdempotencyStore(":memory:");
  state.handler = createHandler(state.store);
  return {
    send: (opts) => send(state.handler, opts),
    close: async () => {
      await state.store.close();
    }
  };
}

function createBaselineRun() {
  const handler = createHandler(null);
  return {
    send: (opts) => send(handler, opts),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.bun-bunsql-sqlite",
  createRun,
  createBaselineRun
});
