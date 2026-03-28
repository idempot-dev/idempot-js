import { Given, When, Then } from "@cucumber/cucumber";

Given(
  "a {word} endpoint at {string} that creates an order",
  async function (method, path) {
    this.requestMethod = method;
    this.requestPath = path;
    await this.startServer();
  }
);

Given("a {word} endpoint at {string}", async function (method, path) {
  this.requestMethod = method;
  this.requestPath = path;
  await this.startServer();
});

Given("the SQLite store is clean", function () {
  // Store is already clean - initialized in Before hook
});

Given("an Idempotency-Key {string}", function (key) {
  this.idempotencyKey = key;
});

Given("an empty Idempotency-Key header", function () {
  this.idempotencyKey = "";
});

Given("an Idempotency-Key of {int} characters", function (length) {
  this.idempotencyKey = "a".repeat(length);
});

Given("the endpoint will delay processing by {int}ms", function (delayMs) {
  this.responseDelay = delayMs;
});

Given("the key {string} is currently being processed", async function (key) {
  // Pre-populate store with "processing" state
  const fingerprint = "test-fingerprint-placeholder";
  await this.store.startProcessing(key, fingerprint, 60000);
});

Given(
  "I previously sent a POST request to {string} with body {string}",
  async function (path, body) {
    const response = await this.sendRequest(
      path,
      "POST",
      JSON.parse(body),
      this.idempotencyKey
    );
    this.previousRequest = response;
    // Wait a bit to ensure request completes
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
);

When(
  "I send a POST request to {string} without an Idempotency-Key header",
  async function (path) {
    this.responseIndex++;
    this.lastResponse = await this.sendRequest(path, "POST", { foo: "bar" });
    this.lastResponseIndex = this.responseIndex;
  }
);

When(
  "I send a POST request to {string} with body {string}",
  async function (path, bodyStr) {
    this.responseIndex++;
    const body = JSON.parse(bodyStr);
    this.lastResponse = await this.sendRequest(
      path,
      "POST",
      body,
      this.idempotencyKey
    );
    this.lastResponseIndex = this.responseIndex;
  }
);

When(
  "I send a POST request to {string} with empty body",
  async function (path) {
    this.responseIndex++;
    this.lastResponse = await this.sendRequest(
      path,
      "POST",
      {},
      this.idempotencyKey
    );
    this.lastResponseIndex = this.responseIndex;
  }
);

When("I send a GET request to {string}", async function (path) {
  this.responseIndex++;
  this.lastResponse = await this.sendRequest(
    path,
    "GET",
    null,
    this.idempotencyKey
  );
  this.lastResponseIndex = this.responseIndex;
});

When("I send a DELETE request to {string}", async function (path) {
  this.responseIndex++;
  this.lastResponse = await this.sendRequest(
    path,
    "DELETE",
    null,
    this.idempotencyKey
  );
  this.lastResponseIndex = this.responseIndex;
});

When(
  "I send a PUT request to {string} with body {string}",
  async function (path, bodyStr) {
    this.responseIndex++;
    const body = JSON.parse(bodyStr);
    this.lastResponse = await this.sendRequest(
      path,
      "PUT",
      body,
      this.idempotencyKey
    );
    this.lastResponseIndex = this.responseIndex;
  }
);

When(
  "I send a PATCH request to {string} with body {string}",
  async function (path, bodyStr) {
    this.responseIndex++;
    const body = JSON.parse(bodyStr);
    this.lastResponse = await this.sendRequest(
      path,
      "PATCH",
      body,
      this.idempotencyKey
    );
    this.lastResponseIndex = this.responseIndex;
  }
);
