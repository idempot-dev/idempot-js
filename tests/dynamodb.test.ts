import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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
