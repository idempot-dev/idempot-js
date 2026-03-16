import Redis from "ioredis";
import { ulid } from "ulid";
import { RedisIdempotencyStore } from "../../../packages/stores/redis/index.js";

export async function createRedisStore() {
  const prefix = `test${ulid()}`;
  const client = new Redis({
    host: "127.0.0.1",
    port: 6379,
    keyPrefix: `${prefix}:`
  });
  return {
    store: new RedisIdempotencyStore({ client }),
    client,
    prefix
  };
}

export async function cleanupRedis(client) {
  if (client) {
    await client.flushdb();
  }
}

export async function closeRedis(client) {
  if (client) {
    await client.quit();
  }
}
