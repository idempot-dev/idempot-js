import { describe, test, expect } from "bun:test";
import type { Context } from "aws-lambda";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { idempotency, BunSqliteIdempotencyStore } from "../../src/index.js";

describe("Lambda Function URL Integration", () => {
  // Use in-memory SQLite for testing (Bun-native, no external dependencies)
  const store = new BunSqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/orders", idempotency({ store }), async (c) => {
    const body = await c.req.json();
    const orderId = Math.random().toString(36).substring(7);
    return c.json({ id: orderId, status: "created", ...body }, 201);
  });

  app.post("/payments", idempotency({ store, required: true }), async (c) => {
    const body = await c.req.json();
    const paymentId = Math.random().toString(36).substring(7);
    return c.json({ id: paymentId, status: "completed", ...body }, 200);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  const handler = handle(app);

  const createFunctionURLEvent = (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string
  ) => ({
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers,
    requestContext: {
      accountId: "123456789012",
      apiId: "test-fn-url",
      domainName: "test-fn-url.lambda-url.us-east-1.on.aws",
      domainPrefix: "test-fn-url",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test-agent"
      },
      requestId: "test-request-id",
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    body: body || "",
    isBase64Encoded: false
  });

  const createContext = (): Partial<Context> => ({
    functionName: "test-function",
    functionVersion: "1",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:test",
    memoryLimitInMB: "128",
    awsRequestId: "test-request-id",
    logGroupName: "/aws/lambda/test",
    logStreamName: "2026/01/25/[$LATEST]test"
  });

  test("handles POST request with idempotency key", async () => {
    const event = createFunctionURLEvent(
      "POST",
      "/orders",
      {
        "content-type": "application/json",
        "idempotency-key": "test-key-url-123"
      },
      JSON.stringify({ item: "widget", quantity: 5 })
    );

    const response = await handler(event, createContext());

    expect(response.statusCode).toBe(201);
    expect(response.headers).toBeDefined();
    expect(response.headers["content-type"]).toContain("application/json");

    const body = JSON.parse(response.body);
    expect(body.status).toBe("created");
    expect(body.item).toBe("widget");
    expect(body.quantity).toBe(5);
    expect(body.id).toBeDefined();
  });

  test("returns cached response for duplicate request", async () => {
    const event = createFunctionURLEvent(
      "POST",
      "/orders",
      {
        "content-type": "application/json",
        "idempotency-key": "duplicate-key-url"
      },
      JSON.stringify({ item: "gadget", quantity: 3 })
    );

    const response1 = await handler(event, createContext());
    const body1 = JSON.parse(response1.body);

    const response2 = await handler(event, createContext());
    const body2 = JSON.parse(response2.body);

    expect(response1.statusCode).toBe(201);
    expect(response2.statusCode).toBe(201);
    // Most important: same ID means cache is working
    expect(body1.id).toBe(body2.id);
  });

  test("handles GET request without idempotency", async () => {
    const event = createFunctionURLEvent("GET", "/health", {});

    const response = await handler(event, createContext());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
  });

  test("requires idempotency key for /payments endpoint", async () => {
    const event = createFunctionURLEvent(
      "POST",
      "/payments",
      {
        "content-type": "application/json"
      },
      JSON.stringify({ amount: 100 })
    );

    const response = await handler(event, createContext());

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain("Idempotency-Key");
  });

  test("processes payment with idempotency key", async () => {
    const event = createFunctionURLEvent(
      "POST",
      "/payments",
      {
        "content-type": "application/json",
        "idempotency-key": "payment-key-url-456"
      },
      JSON.stringify({ amount: 100, currency: "USD" })
    );

    const response = await handler(event, createContext());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("completed");
    expect(body.amount).toBe(100);
    expect(body.id).toBeDefined();
  });
});
