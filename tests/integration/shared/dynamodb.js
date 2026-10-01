import { ulid } from "ulid";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import { DynamoDbIdempotencyStore } from "../../../packages/stores/dynamodb/index.js";

const DYNAMODB_PORT = process.env.DYNAMODB_PORT
  ? Number(process.env.DYNAMODB_PORT)
  : 8000;

export function getDynamoDBEndpoint() {
  return process.env.DYNAMODB_ENDPOINT ?? `http://localhost:${DYNAMODB_PORT}`;
}

/**
 * Creates a DynamoDB-backed store against a per-run table with the schema
 * the store requires (primary key on `key`, GSI `fingerprint-index`).
 * @returns {Promise<{store: DynamoDbIdempotencyStore, client: DynamoDBClient, tableName: string}>}
 */
export async function createDynamoDBStore() {
  const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: getDynamoDBEndpoint(),
    credentials: { accessKeyId: "test", secretAccessKey: "test" }
  });
  const tableName = `idempotency-test-${ulid().toLowerCase()}`;

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: "key", AttributeType: "S" },
        { AttributeName: "fingerprint", AttributeType: "S" }
      ],
      KeySchema: [{ AttributeName: "key", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "fingerprint-index",
          KeySchema: [{ AttributeName: "fingerprint", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" }
        }
      ],
      BillingMode: "PAY_PER_REQUEST"
    })
  );
  await waitUntilTableExists(
    { client, maxWaitTime: 15, minDelay: 0.2, maxDelay: 1 },
    { TableName: tableName }
  );

  return {
    store: new DynamoDbIdempotencyStore({ client, tableName }),
    client,
    tableName
  };
}

/**
 * Removes the per-run table. DynamoDB Local deletes synchronously.
 * @param {DynamoDBClient} client
 * @param {string} tableName
 * @returns {Promise<void>}
 */
export async function cleanupDynamoDB(client, tableName) {
  if (!client || !tableName) return;
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch {
    // table already gone
  }
}
