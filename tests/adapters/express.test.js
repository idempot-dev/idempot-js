import { test } from "tap";
import { createRequestAdapter, createResponseAdapter } from "../../src/adapters/express.js";

test("express adapter - createRequestAdapter returns method", async (t) => {
  const mockReq = { method: "POST" };
  const adapter = createRequestAdapter(mockReq);
  t.equal(adapter.method, "POST");
});

test("express adapter - createRequestAdapter returns header", async (t) => {
  const mockReq = {
    method: "POST",
    headers: { "idempotency-key": "test-key" }
  };
  const adapter = createRequestAdapter(mockReq);
  t.equal(adapter.header("Idempotency-Key"), "test-key");
});

test("express adapter - createRequestAdapter returns header as array", async (t) => {
  const mockReq = {
    method: "POST",
    headers: { "idempotency-key": ["test-key-1", "test-key-2"] }
  };
  const adapter = createRequestAdapter(mockReq);
  t.equal(adapter.header("Idempotency-Key"), "test-key-1");
});

test("express adapter - createRequestAdapter returns body", async (t) => {
  const mockReq = {
    method: "POST",
    headers: {},
    body: JSON.stringify({ foo: "bar" })
  };
  const adapter = createRequestAdapter(mockReq);
  const body = await adapter.body();
  t.equal(body, '{"foo":"bar"}');
});

test("express adapter - createRequestAdapter returns body as object", async (t) => {
  const mockReq = {
    method: "POST",
    headers: {},
    body: { foo: "bar" }
  };
  const adapter = createRequestAdapter(mockReq);
  const body = await adapter.body();
  t.equal(body, '{"foo":"bar"}');
});

test("express adapter - createRequestAdapter returns empty string for undefined body", async (t) => {
  const mockReq = {
    method: "POST",
    headers: {}
  };
  const adapter = createRequestAdapter(mockReq);
  const body = await adapter.body();
  t.equal(body, "");
});

test("express adapter - createResponseAdapter returns status", async (t) => {
  const mockRes = { statusCode: 201, getHeaders: () => ({}) };
  const adapter = createResponseAdapter(mockRes);
  t.equal(adapter.status, 201);
});

test("express adapter - createResponseAdapter returns headers", async (t) => {
  const mockRes = {
    statusCode: 200,
    getHeaders: () => ({ "content-type": "application/json" })
  };
  const adapter = createResponseAdapter(mockRes);
  t.equal(adapter.headers.get("content-type"), "application/json");
});
