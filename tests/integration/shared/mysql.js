import { MysqlIdempotencyStore } from "../../../packages/stores/mysql/node-mysql.js";
import { readPort } from "./env.js";

const MYSQL_PORT = readPort("MYSQL_PORT", 3307);

export function nodeMysqlOptions(tableName = "idempotency_records") {
  return {
    host: "localhost",
    port: MYSQL_PORT,
    database: "test",
    user: "idempot",
    password: "idempot",
    tableName
  };
}

export function createNodeMysqlStore(tableName = "idempotency_records") {
  const store = new MysqlIdempotencyStore(nodeMysqlOptions(tableName));
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
      `SELECT * FROM \`${store.tableName}\` WHERE \`key\` = ?`,
      [key]
    );
    if (rows[0]?.status === "complete") return;
  }
}
