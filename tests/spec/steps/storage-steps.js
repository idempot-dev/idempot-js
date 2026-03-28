import { Then } from "@cucumber/cucumber";

Then("an idempotency record should exist with key {string}", function (key) {
  const records = this.getIdempotencyRecords();
  const record = records.find((r) => r.key === key);
  if (!record) {
    throw new Error(
      `No idempotency record found for key "${key}". Records: ${JSON.stringify(records)}`
    );
  }
});

Then("the idempotency record status should be {string}", function (status) {
  const records = this.getIdempotencyRecords();
  const record = records[records.length - 1]; // Get latest record
  if (!record) {
    throw new Error("No idempotency records found");
  }
  if (record.status !== status) {
    throw new Error(`Expected status "${status}", got "${record.status}"`);
  }
});

Then(
  "the idempotency record response status should be {int}",
  function (status) {
    const records = this.getIdempotencyRecords();
    const record = records[records.length - 1]; // Get latest record
    if (!record) {
      throw new Error("No idempotency records found");
    }
    if (record.responseStatus !== status) {
      throw new Error(
        `Expected response status ${status}, got ${record.responseStatus}`
      );
    }
  }
);

Then(
  "the idempotency record response body should contain {string}",
  function (text) {
    const records = this.getIdempotencyRecords();
    const record = records[records.length - 1]; // Get latest record
    if (!record) {
      throw new Error("No idempotency records found");
    }
    if (!record.responseBody.includes(text)) {
      throw new Error(
        `Expected response body to contain "${text}", got: ${record.responseBody}`
      );
    }
  }
);

Then(
  "{int} idempotency records should exist with key {string}",
  function (count, key) {
    const records = this.getIdempotencyRecords();
    const matchingRecords = records.filter((r) => r.key === key);
    if (matchingRecords.length !== count) {
      throw new Error(
        `Expected ${count} idempotency records for key "${key}", got ${matchingRecords.length}`
      );
    }
  }
);

Then("{int} orders should exist in the database", function (count) {
  const orderCount = this.getOrderCount();
  if (orderCount !== count) {
    throw new Error(`Expected ${count} orders, got ${orderCount}`);
  }
});
