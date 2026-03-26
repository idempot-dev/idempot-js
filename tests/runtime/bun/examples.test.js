import { describe, test, expect } from "bun:test";

describe("Bun Example Apps", () => {
  test("bun-basic-app exports valid server config", async () => {
    const module = await import("../../../examples/bun-basic-app.js");

    expect(module.default).toBeDefined();
    expect(module.default.port).toBe(3000);
    expect(module.default.fetch).toBeDefined();
    expect(typeof module.default.fetch).toBe("function");
  });

  test("bun-basic-app responds to POST /orders", async () => {
    const module = await import("../../../examples/bun-basic-app.js");

    const request = new Request("http://localhost:3000/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "test-key-123-abcde-fgh"
      },
      body: JSON.stringify({ item: "widget", quantity: 5 })
    });

    const response = await module.default.fetch(request);

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.status).toBe("created");
    expect(data.item).toBe("widget");
    expect(data.quantity).toBe(5);
  });

  test("bun-basic-app returns cached response for duplicate request", async () => {
    const module = await import("../../../examples/bun-basic-app.js");

    const makeRequest = () =>
      new Request("http://localhost:3000/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "duplicate-test-key-xy"
        },
        body: JSON.stringify({ item: "gadget", quantity: 3 })
      });

    const response1 = await module.default.fetch(makeRequest());
    const data1 = await response1.json();

    const response2 = await module.default.fetch(makeRequest());
    const data2 = await response2.json();

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);
    expect(data1.id).toBe(data2.id);
  });

  test("bun-sql-app exports valid server config", async () => {
    const module = await import("../../../examples/bun-sql-app.js");

    expect(module.default).toBeDefined();
    expect(module.default.port).toBe(3000);
    expect(module.default.fetch).toBeDefined();
    expect(typeof module.default.fetch).toBe("function");
  });

  test("bun-sql-app responds to POST /orders", async () => {
    const module = await import("../../../examples/bun-sql-app.js");

    const request = new Request("http://localhost:3000/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "sql-test-key-abcd-e-123"
      },
      body: JSON.stringify({ item: "tool", quantity: 2 })
    });

    const response = await module.default.fetch(request);

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.status).toBe("created");
    expect(data.item).toBe("tool");
    expect(data.quantity).toBe(2);
  });
});
