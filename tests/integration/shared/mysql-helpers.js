import { createRequire } from "module";

import { readPort } from "./env.js";

const require = createRequire(import.meta.url);

const MYSQL_PORT = readPort("MYSQL_PORT", 3307);

export function generateTableName() {
  return `idempotency_records_${process.pid}_${Date.now()}`;
}

export async function initMysqlSchema(tableName = "idempotency_records") {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: "localhost",
    port: MYSQL_PORT,
    user: "idempot",
    password: "idempot",
    database: "test"
  });

  const createTableSQL = `
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
  `;
  await pool.query(createTableSQL);
  await pool.end();
}
