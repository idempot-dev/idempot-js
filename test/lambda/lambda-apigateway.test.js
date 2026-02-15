import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { idempotency } from "../../src/index.js";
import { BunSqliteIdempotencyStore } from "../../src/store/bun-sqlite.js";

describe("Lambda API Gateway Integration", () => {
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

  const createAPIGatewayEvent = (method, path, headers, body) => ({
    httpMethod: method,
    path,
    headers,
    body: body || null,
    isBase64Encoded: false,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: "123456789012",
      apiId: "test-api",
      protocol: "HTTP/1.1",
      httpMethod: method,
      path,
      stage: "test",
      requestId: "test-request-id",
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      identity: {
        sourceIp: "127.0.0.1",
        userAgent: "test-agent"
      }
    }
  });

  const createContext = () => ({
    functionName: "test-function",
    functionVersion: "1",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:test",
    memoryLimitInMB: "128",
    awsRequestId: "test-request-id",
    logGroupName: "/aws/lambda/test",
    logStreamName: "2026/01/25/[$LATEST]test"
  });

  test("handles POST request with idempotency key", async () => {
    const event = createAPIGatewayEvent(
      "POST",
      "/orders",
      {
        "content-type": "application/json",
        "idempotency-key": "test-key-123"
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
    const event = createAPIGatewayEvent(
      "POST",
      "/orders",
      {
        "content-type": "application/json",
        "idempotency-key": "duplicate-key-apigw"
      },
      JSON.stringify({ item: "gadget", quantity: 3 })
    );

    const response1 = await handler(event, createContext());
    const body1 = JSON.parse(response1.body);

    const response2 = await handler(event, createContext());
    const body2 = JSON.parse(response2.body);

    expect(response1.statusCode).toBe(201);
    expect(response2.statusCode).toBe(201);
    expect(body1.id).toBe(body2.id);
  });

  test("handles GET request without idempotency", async () => {
    const event = createAPIGatewayEvent("GET", "/health", {});

    const response = await handler(event, createContext());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
  });

  test("requires idempotency key for /payments endpoint", async () => {
    const event = createAPIGatewayEvent(
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
    const event = createAPIGatewayEvent(
      "POST",
      "/payments",
      {
        "content-type": "application/json",
        "idempotency-key": "payment-key-123"
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
