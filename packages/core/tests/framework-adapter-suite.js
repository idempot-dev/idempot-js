import { test } from "tap";

/**
 * Validates adapter interface
 * @param {Object} adapter
 * @throws {Error} if adapter is invalid
 */
function validateAdapter(adapter) {
  if (!adapter.name || typeof adapter.name !== "string") {
    throw new Error("Adapter must have a 'name' string property");
  }
  if (typeof adapter.setup !== "function") {
    throw new Error("Adapter must have a 'setup' function");
  }
  if (typeof adapter.createMiddleware !== "function") {
    throw new Error("Adapter must have a 'createMiddleware' function");
  }
  if (typeof adapter.createStore !== "function") {
    throw new Error("Adapter must have a 'createStore' function");
  }
}

/**
 * Normalizes response format across frameworks
 * @param {Object} response
 * @returns {Object}
 */
function normalizeResponse(response) {
  if (!response || typeof response !== "object") {
    throw new Error("Adapter request() must return an object");
  }

  return {
    status: response.status ?? response.statusCode,
    headers: response.headers || {},
    body: response.body
  };
}

/**
 * Generate framework adapter tests
 * Call this in your adapter test file to run the full test suite
 *
 * @param {Object} adapter
 * @param {string} adapter.name - Framework name (e.g., "hono")
 * @param {Function} adapter.setup - Returns { mount, request, teardown }
 * @param {Function} adapter.createMiddleware - (options) => middleware
 */
export function runAdapterTests(adapter) {
  validateAdapter(adapter);

  // Test: Store validation
  test(`${adapter.name} - throws when store is not provided`, async (t) => {
    t.throws(
      () => adapter.createMiddleware({}),
      /IdempotencyStore must be provided/i,
      "should throw error about store"
    );
  });

  // Test: GET pass-through
  test(`${adapter.name} - GET requests pass through without idempotency processing`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    let handlerCalled = false;

    mount("GET", "/test", middleware, async (req, res) => {
      handlerCalled = true;
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "GET",
        path: "/test",
        headers: {},
        body: null
      })
    );

    t.ok(handlerCalled, "handler should be called");
    t.equal(response.status, 200, "should return 200");

    await teardown();
  });

  // Test: Optional key without header
  test(`${adapter.name} - POST without key when optional`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store, required: false });
    let handlerCalled = false;

    mount("POST", "/test", middleware, async (req, res) => {
      handlerCalled = true;
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: {},
        body: { foo: "bar" }
      })
    );

    t.ok(handlerCalled, "handler should be called");
    t.equal(response.status, 200, "should return 200");

    await teardown();
  });

  // Test: Required key missing
  test(`${adapter.name} - POST without key when required returns 400`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store, required: true });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: {},
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 400, "should return 400");
    t.match(response.body?.error || JSON.stringify(response.body), /required/i);

    await teardown();
  });

  // Test: Key too long
  test(`${adapter.name} - rejects keys longer than 255 characters`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const longKey = "a".repeat(256);
    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": longKey },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 400, "should return 400");
    t.match(
      response.body?.error || JSON.stringify(response.body),
      /255|too long|maximum/i
    );

    await teardown();
  });

  // Test: Key with comma
  test(`${adapter.name} - rejects keys containing commas`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "key-with,comma-16chars" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 400, "should return 400");
    t.match(response.body?.error || JSON.stringify(response.body), /comma/i);

    await teardown();
  });

  // Test: Empty key
  test(`${adapter.name} - rejects empty key`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 400, "should return 400");

    await teardown();
  });

  // Test: First request caches
  test(`${adapter.name} - caches response on first request`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;

    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ id: "order-123", count: callCount });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "cache-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 200);
    t.equal(callCount, 1);
    t.equal(response.body?.id, "order-123");

    await teardown();
  });

  // Test: Replay cached response
  test(`${adapter.name} - replays cached response on duplicate request`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;

    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ id: "order-123", count: callCount, ts: Date.now() });
    });

    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "replay-key-12345678901" },
      body: { foo: "bar" }
    });

    const response2 = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "replay-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response2.status, 200);
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(response2.body?.count, 1);

    const replayHeader =
      response2.headers["x-idempotent-replayed"] ||
      response2.headers["X-Idempotent-Replayed"];
    t.equal(replayHeader, "true", "should have replay header");

    await teardown();
  });

  // Test: Concurrent processing (explicit state, no timing)
  test(`${adapter.name} - detects concurrent processing with 409`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    // Pre-populate store with "processing" state
    const fingerprint = "test-fingerprint-123";
    await store.startProcessing(
      "concurrent-key-12345678901",
      fingerprint,
      60000
    );

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "concurrent-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 409, "should return 409");
    t.match(
      response.body?.error || JSON.stringify(response.body),
      /already being processed/i
    );

    await teardown();
  });

  // Test: Payload mismatch
  test(`${adapter.name} - detects same key with different payload returns 422`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "mismatch-key-12345678901" },
      body: { foo: "bar" }
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "mismatch-key-12345678901" },
        body: { foo: "different" }
      })
    );

    t.equal(response.status, 422);
    t.match(
      response.body?.error || JSON.stringify(response.body),
      /different.*payload/i
    );

    await teardown();
  });

  // Test: Fingerprint collision
  test(`${adapter.name} - detects different key with same fingerprint returns 409`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "key-1-16-chars-longxx" },
      body: { foo: "bar" }
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "key-2-16-chars-longxx" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 409);
    t.match(
      response.body?.error || JSON.stringify(response.body),
      /different.*key/i
    );

    await teardown();
  });

  // Test: Non-standard lookup status passes through to handler
  test(`${adapter.name} - handles byKey with non-standard status passes through`, async (t) => {
    const store = {
      lookup: async (key, fingerprint) => {
        return {
          byKey: { key: key, fingerprint: fingerprint, status: "unknown" },
          byFingerprint: null
        };
      },
      startProcessing: async () => {},
      complete: async () => {}
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    let callCount = 0;
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ message: "created" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "test-key-123456789012" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 200, "should pass through to handler");
    t.equal(callCount, 1, "handler should be called");
    t.equal(
      response.body?.message,
      "created",
      "should return handler response"
    );

    await teardown();
  });

  // Test: Lookup failure
  test(`${adapter.name} - returns 503 when lookup fails`, async (t) => {
    const store = adapter.createStore();
    store.lookup = async () => {
      throw new Error("Store unavailable");
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "test-key-123456789012" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 503);

    await teardown();
  });

  // Test: startProcessing failure
  test(`${adapter.name} - returns 503 when startProcessing fails`, async (t) => {
    const store = adapter.createStore();
    store.startProcessing = async () => {
      throw new Error("Store unavailable");
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "test-key-123456789012" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 503);

    await teardown();
  });

  // Test: complete failure (should not fail request)
  test(`${adapter.name} - continues when complete fails`, async (t) => {
    const store = adapter.createStore();
    store.complete = async () => {
      throw new Error("Connection failed");
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "test-key-123456789012" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 200, "should return 200 even if complete fails");

    await teardown();
  });

  // Test: Field exclusion
  test(`${adapter.name} - field exclusion works correctly`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({
      store,
      excludeFields: ["timestamp"]
    });
    let callCount = 0;

    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ ok: true });
    });

    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "exclude-key-12345678901" },
      body: { data: "test", timestamp: "2024-01-01" }
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "exclude-key-12345678901" },
        body: { data: "test", timestamp: "2024-01-02" }
      })
    );

    t.equal(response.status, 200);
    t.equal(callCount, 1);

    await teardown();
  });

  // Test: PATCH method
  test(`${adapter.name} - PATCH method is protected`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;

    mount("PATCH", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ updated: true });
    });

    await request({
      method: "PATCH",
      path: "/test",
      headers: { "idempotency-key": "patch-key-12345678901" },
      body: { data: "test" }
    });

    const response = normalizeResponse(
      await request({
        method: "PATCH",
        path: "/test",
        headers: { "idempotency-key": "patch-key-12345678901" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 200);
    t.equal(callCount, 1);

    await teardown();
  });

  // Test: Empty body
  test(`${adapter.name} - handles empty body`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "empty-body-key-123456" },
        body: null
      })
    );

    t.equal(response.status, 200);

    await teardown();
  });

  // Test: String body
  test(`${adapter.name} - handles string body`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ received: req.body });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: {
          "idempotency-key": "string-body-key-123456",
          "content-type": "text/plain"
        },
        body: "plain text body"
      })
    );

    t.equal(response.status, 200);

    await teardown();
  });

  // Test: Circuit breaker exposure
  test(`${adapter.name} - exposes circuit breaker`, async (t) => {
    const store = adapter.createStore();
    const middleware = adapter.createMiddleware({ store });
    t.ok(middleware.circuit, "should expose circuit breaker");
  });

  // Test: String response body with caching
  test(`${adapter.name} - handles string response body`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send("text response");
    });

    const response1 = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "string-response-key-123" },
        body: { foo: "bar" }
      })
    );

    t.equal(response1.status, 200);
    t.equal(response1.body, "text response");

    const response2 = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "string-response-key-123" },
        body: { foo: "bar" }
      })
    );

    t.equal(response2.status, 200);
    t.equal(response2.headers["x-idempotent-replayed"], "true");
    t.equal(response2.body, "text response");

    await teardown();
  });
}
