import { test } from "tap";
import RedisMock from "ioredis-mock";
import { RedisIdempotencyStore } from "../src/store/redis.js";

test("RedisIdempotencyStore - initialization", (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });
  t.ok(store, "store should be created");
  t.end();
});
