import { NodeMysqlIdempotencyStore } from "../../../packages/stores/node-mysql/index.js";

export function nodeMysqlOptions() {
  return {
    host: "localhost",
    port: 3306,
    database: "test",
    user: "idempot",
    password: "idempot"
  };
}

export function createNodeMysqlStore() {
  const store = new NodeMysqlIdempotencyStore(nodeMysqlOptions());
  return store;
}

export async function waitForIdempotencyRecordComplete(
  store,
  key,
  maxAttempts = 20,
  intervalMs = 20
) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const [rows] = await store.pool.query(
      "SELECT * FROM idempotency_records WHERE `key` = ?",
      [key]
    );
    if (rows[0]?.status === "complete") return;
  }
}
