import { MysqlIdempotencyStore } from "../../../packages/stores/mysql/node-mysql.js";

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
  const store = new MysqlIdempotencyStore(nodeMysqlOptions());
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
