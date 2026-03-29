import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { RedisIdempotencyStore } from "../../../packages/stores/redis/deno-redis.js";
import { createFakeRedisClient } from "./redis-test-helpers.js";

Deno.test(
  "RedisIdempotencyStore (Deno) can start and complete processing",
  async () => {
    const client = createFakeRedisClient();
    const store = new RedisIdempotencyStore({ client });

    // Mock the init to use fake client
    store.redis = client;

    await store.startProcessing("key1", "fingerprint1", 60000);

    const result = await store.lookup("key1", "fingerprint1");
    assertEquals(result.byKey?.status, "processing");

    await store.complete("key1", {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"success":true}'
    });

    const completed = await store.lookup("key1", "fingerprint1");
    assertEquals(completed.byKey?.status, "complete");
    assertEquals(completed.byKey?.response?.status, 200);

    await store.close();
  }
);

Deno.test(
  "RedisIdempotencyStore (Deno) complete throws on missing key",
  async () => {
    const client = createFakeRedisClient();
    const store = new RedisIdempotencyStore({ client });

    // Mock the init to use fake client
    store.redis = client;

    try {
      await store.complete("nonexistent", {
        status: 200,
        headers: {},
        body: ""
      });
      throw new Error("Should have thrown");
    } catch (e) {
      assertEquals(e.message.includes("No record found"), true);
    }

    await store.close();
  }
);