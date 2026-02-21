import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DenoDynamoDbIdempotencyStore } from "../../src/store/deno-dynamodb.js";

Deno.test("DenoDynamoDbIdempotencyStore can start and complete processing", async () => {
  const store = new DenoDynamoDbIdempotencyStore({ 
    tableName: "idempotency-test",
    testMode: true
  });
  
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
  
  store.close();
});

Deno.test("DenoDynamoDbIdempotencyStore complete throws on missing key", async () => {
  const store = new DenoDynamoDbIdempotencyStore({ 
    tableName: "idempotency-test",
    testMode: true
  });
  
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
  
  store.close();
});

Deno.test("DenoDynamoDbIdempotencyStore cleanup is no-op", async () => {
  const store = new DenoDynamoDbIdempotencyStore({ 
    tableName: "idempotency-test",
    testMode: true
  });
  
  await store.cleanup();
  
  store.close();
});
