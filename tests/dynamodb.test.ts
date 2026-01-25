import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDbIdempotencyStore } from "../src/store/dynamodb.js";

test("DynamoDbIdempotencyStore - initialization", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  t.ok(store, "store should be created");
  t.end();
});

test("DynamoDbIdempotencyStore - initialization with custom table name", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any,
    tableName: "custom-table"
  });

  t.ok(store, "store should be created with custom table");
  t.end();
});

test("DynamoDbIdempotencyStore - lookup with empty store", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});

test("DynamoDbIdempotencyStore - startProcessing creates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  let capturedItem: any = null;
  ddbMock.on(PutCommand).callsFake((input) => {
    capturedItem = input.Item;
    return {};
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const beforeTime = Math.floor(Date.now() / 1000);
  await store.startProcessing("test-key", "test-fp", 60000);
  const afterTime = Math.floor((Date.now() + 60000) / 1000);

  t.ok(capturedItem, "should have called PutCommand");
  t.equal(capturedItem.key, "test-key", "key should match");
  t.equal(capturedItem.fingerprint, "test-fp", "fingerprint should match");
  t.equal(capturedItem.status, "processing", "status should be processing");
  t.ok(
    capturedItem.expiresAt >= beforeTime && capturedItem.expiresAt <= afterTime,
    "expiresAt should be in expected range"
  );
});
