import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { idempotency } from "@idempot/hono-middleware";
import { DynamoDbIdempotencyStore } from "@idempot/dynamodb-store";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Deployed-bundle entry point. Inside the Floci Lambda container the SDK
// picks the emulator up from the injected AWS_ENDPOINT_URL; against real
// AWS no endpoint is needed. Module scope keeps client and store warm
// across invocations, exactly as the guide recommends.
const client = new DynamoDBClient({ region: "us-east-1" });
const store = new DynamoDbIdempotencyStore({
  client,
  tableName: process.env.IDEMPOTENCY_TABLE ?? "idempotency"
});

const app = new Hono();
app.use("*", idempotency({ store }));
app.post("/api", (c) => c.json({ success: true }));

export const handler = handle(app);
