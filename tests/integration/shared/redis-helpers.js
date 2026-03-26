import { execSync } from "child_process";
import Redis from "ioredis";

const REDIS_PORT = 6379;

export async function startRedis() {
  console.log("Starting local Redis...");
  try {
    execSync("brew services start redis", { stdio: "inherit" });
  } catch {}
}

export async function stopRedis() {
  try {
    execSync("brew services stop redis", { stdio: "inherit" });
  } catch {}
}

export function getRedisClient() {
  return new Redis({
    host: "localhost",
    port: REDIS_PORT
  });
}

export async function cleanupRedisPrefix(prefix) {
  const client = getRedisClient();
  const keys = await client.keys(`${prefix}*`);
  if (keys.length > 0) {
    await client.del(...keys);
  }
  await client.quit();
}
