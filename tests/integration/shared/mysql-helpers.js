import { execSync } from "child_process";

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
