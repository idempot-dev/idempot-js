import Redis from "ioredis";
import { ulid } from "ulid";
import { RedisIdempotencyStore } from "../../../packages/stores/redis/index.js";

const testPrefix = `test-${ulid()}`;

let sharedClient = null;

export async function createRedisStore() {
  if (!sharedClient) {
    sharedClient = new Redis({
      host: "127.0.0.1",
      port: 6379,
      lazyConnect: true,
      keyPrefix: `${testPrefix}:`
    });
    await sharedClient.connect();
  }
  return new RedisIdempotencyStore({ client: sharedClient });
}

export async function cleanupRedis() {
  if (sharedClient) {
    await sharedClient.flushdb();
  }
}
