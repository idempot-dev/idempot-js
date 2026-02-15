import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { DynamoDbIdempotencyStore } from "../src/store/dynamodb.js";

test("DynamoDbIdempotencyStore - initialization", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  t.ok(store, "store should be created");
  t.end();
});

test("DynamoDbIdempotencyStore - initialization with custom table name", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock,
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
    client: ddbMock
  });

  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});

test("DynamoDbIdempotencyStore - startProcessing creates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  let capturedItem = null;
  ddbMock.on(PutCommand).callsFake((input) => {
    capturedItem = input.Item;
    return {};
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
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

test("DynamoDbIdempotencyStore - complete updates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  let capturedInput = null;
  ddbMock.on(UpdateCommand).callsFake((input) => {
    capturedInput = input;
    return {};
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result": "success"}'
  });

  t.ok(capturedInput, "should have called UpdateCommand");
  t.equal(capturedInput.Key.key, "test-key", "key should match");
  t.equal(
    capturedInput.TableName,
    "idempotency-records",
    "table name should match"
  );
  t.ok(capturedInput.UpdateExpression, "should have UpdateExpression");
  t.ok(capturedInput.ConditionExpression, "should have ConditionExpression");
  t.ok(
    capturedInput.ExpressionAttributeValues,
    "should have ExpressionAttributeValues"
  );
});

test("DynamoDbIdempotencyStore - complete throws on missing key", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const error = new Error("ConditionalCheckFailedException");
  error.name = "ConditionalCheckFailedException";
  ddbMock.on(UpdateCommand).rejects(error);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  try {
    await store.complete("missing-key", {
      status: 200,
      headers: {},
      body: ""
    });
    t.fail("should throw error for missing key");
  } catch (err) {
    t.ok(err, "should throw error");
    t.match(
      err.message,
      /Record not found/,
      "error message should mention record not found"
    );
  }
});

test("DynamoDbIdempotencyStore - complete rethrows unknown errors", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const error = new Error("Network error");
  error.name = "NetworkError";
  ddbMock.on(UpdateCommand).rejects(error);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  try {
    await store.complete("test-key", {
      status: 200,
      headers: {},
      body: ""
    });
    t.fail("should have thrown");
  } catch (err) {
    t.equal(err.message, "Network error", "should rethrow unknown error");
  }
});

test("DynamoDbIdempotencyStore - lookup filters expired records", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const now = Math.floor(Date.now() / 1000);
  const expiredRecord = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "processing",
    expiresAt: now - 100 // Expired 100 seconds ago
  };

  ddbMock.on(GetCommand).resolves({ Item: expiredRecord });
  ddbMock.on(QueryCommand).resolves({ Items: [expiredRecord] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey, null, "byKey should be null for expired record");
  t.equal(
    result.byFingerprint,
    null,
    "byFingerprint should be null for expired record"
  );
});

test("DynamoDbIdempotencyStore - lookup by fingerprint only", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const now = Math.floor(Date.now() / 1000);
  const fingerprintRecord = {
    key: "different-key",
    fingerprint: "test-fp",
    status: "completed",
    responseStatus: 200,
    responseHeaders: { "content-type": "text/plain" },
    responseBody: "OK",
    expiresAt: now + 3600
  };

  ddbMock.on(GetCommand).resolves({}); // No record by key
  ddbMock.on(QueryCommand).resolves({ Items: [fingerprintRecord] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  const result = await store.lookup("some-key", "test-fp");

  t.equal(result.byKey, null, "byKey should be null");
  t.ok(result.byFingerprint, "byFingerprint should be found");
  t.equal(
    result.byFingerprint?.key,
    "different-key",
    "key should match fingerprint record"
  );
  t.equal(result.byFingerprint?.status, "completed", "status should match");
  t.equal(
    result.byFingerprint?.response?.status,
    200,
    "response status should match"
  );
});

test("DynamoDbIdempotencyStore - lookup handles missing response headers", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const now = Math.floor(Date.now() / 1000);
  const record = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "completed",
    responseStatus: 200,
    responseBody: "OK",
    expiresAt: now + 3600
  };

  ddbMock.on(GetCommand).resolves({ Item: record });
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "byKey should be found");
  t.ok(result.byKey?.response, "response should be defined");
  t.same(
    result.byKey?.response?.headers,
    {},
    "headers should be empty object when missing"
  );
});

test("DynamoDbIdempotencyStore - lookup handles missing response body", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const now = Math.floor(Date.now() / 1000);
  const record = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "completed",
    responseStatus: 200,
    responseHeaders: { "content-type": "text/plain" },
    expiresAt: now + 3600
  };

  ddbMock.on(GetCommand).resolves({ Item: record });
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "byKey should be found");
  t.ok(result.byKey?.response, "response should be defined");
  t.equal(
    result.byKey?.response?.body,
    "",
    "body should be empty string when missing"
  );
});

test("DynamoDbIdempotencyStore - lookup handles completely missing response", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const now = Math.floor(Date.now() / 1000);
  const record = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "completed",
    expiresAt: now + 3600
  };

  ddbMock.on(GetCommand).resolves({ Item: record });
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "byKey should be found");
  t.equal(
    result.byKey?.response,
    undefined,
    "response should be undefined when no responseStatus"
  );
});

test("DynamoDbIdempotencyStore - cleanup is no-op", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock
  });

  // cleanup should not throw and should be a no-op
  await store.cleanup();
  t.pass("cleanup should be no-op");
});
