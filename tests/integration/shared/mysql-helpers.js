import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const MYSQL_PORT = 3306;

export async function startMysql() {
  console.log("Starting local MySQL...");
  try {
    execSync("brew services start mysql", { stdio: "inherit" });
  } catch {}
}

export async function stopMysql() {
  try {
    execSync("brew services stop mysql", { stdio: "inherit" });
  } catch {}
}

export function getMySqlUrl(database = "test") {
  return `mysql://idempot:idempot@localhost:${MYSQL_PORT}/${database}`;
}

export async function initMysqlSchema() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: "localhost",
    port: MYSQL_PORT,
    user: "idempot",
    password: "idempot",
    database: "test"
  });

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS idempotency_records (
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
