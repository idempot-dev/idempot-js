import { test } from "tap";
import { createFakeDynamoDBClient } from "./dynamodb-test-helpers.js";

test("fake client - rejects an unexpected PutItem condition", async (t) => {
  const client = createFakeDynamoDBClient();
  client.__putError = null;

  await t.rejects(
    client.send({
      input: {
        TableName: "idempotency",
        Item: { key: { S: "k" } },
        ConditionExpression: "attribute_not_exists(key)",
        ExpressionAttributeValues: { ":now": { N: "123" } }
      }
    }),
    /does not implement expression/,
    "unknown condition must fail loudly"
  );
  t.end();
});

test("fake client - rejects an unexpected Query key condition", async (t) => {
  const client = createFakeDynamoDBClient();

  await t.rejects(
    client.send({
      input: {
        TableName: "idempotency",
        IndexName: "fingerprint-index",
        KeyConditionExpression: "fingerprint = :wrong",
        ExpressionAttributeValues: { ":wrong": { S: "f" } }
      }
    }),
    /does not implement expression/,
    "unknown key condition must fail loudly"
  );
  t.end();
});

test("fake client - rejects an unexpected UpdateItem expression", async (t) => {
  const client = createFakeDynamoDBClient();

  await t.rejects(
    client.send({
      input: {
        TableName: "idempotency",
        Key: { key: { S: "k" } },
        UpdateExpression: "SET #s = :s",
        ConditionExpression: "attribute_exists(#k)",
        ExpressionAttributeValues: { ":s": { S: "complete" } }
      }
    }),
    /does not implement expression/,
    "unknown update expression must fail loudly"
  );
  t.end();
});

test("fake client - rejects commands it does not implement", async (t) => {
  const client = createFakeDynamoDBClient();

  await t.rejects(
    client.send({ input: {} }),
    /does not implement command/,
    "unknown command must fail loudly"
  );
  t.end();
});
