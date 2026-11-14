import { test } from "tap";
import { generateScopedFingerprint } from "../src/fingerprint.js";
import { deriveScopeToken, buildRecordKey } from "../src/identity.js";
import { IdempotencyKeyExistsError } from "../src/errors.js";

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
  if (typeof adapter.scope !== "function") {
    throw new Error("Adapter must have a 'scope' function");
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
    t.match(
      response.body?.type ||
        response.body?.title ||
        response.body?.detail ||
        JSON.stringify(response.body),
      /idempotency/i,
      "should have idempotency-related error"
    );

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

  // Test: Coalesced loser through the full middleware stack
  // Two concurrent same-key requests: only the winner's startProcessing
  // reaches the store; the loser takes the lost-race path (409).
  test(`${adapter.name} - coalesces concurrent same-key requests`, async (t) => {
    let startCalls = 0;
    let lookupCount = 0;
    const lookupResolvers = [];
    let resolveWinner;
    const deferredStore = {
      lookup: async () => {
        lookupCount++;
        // Defer the two initial request lookups so both requests are in
        // flight before the winner claims the key; the loser's re-lookup
        // (third call) returns a miss so it takes the 409 branch.
        if (lookupCount <= 2) {
          return new Promise((resolve) => {
            lookupResolvers.push(resolve);
          });
        }
        return { byKey: null, byFingerprint: null };
      },
      startProcessing: async () => {
        startCalls++;
        return new Promise((resolve) => {
          resolveWinner = resolve;
        });
      },
      complete: async () => {}
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store: deferredStore });

    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });

    const requestPromise = () =>
      request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "coalesce-key-12345678901" },
        body: { foo: "bar" }
      });

    const response1 = requestPromise();
    const response2 = requestPromise();

    const waitFor = async (predicate) => {
      for (let i = 0; i < 200; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 5));
      }
      t.fail("timed out waiting for expected middleware state");
    };

    await waitFor(() => lookupResolvers.length === 2);
    // Resolve in FIFO order so request 1 claims the key before request 2
    // reaches startProcessing.
    lookupResolvers[0]({ byKey: null, byFingerprint: null });
    lookupResolvers[1]({ byKey: null, byFingerprint: null });

    await waitFor(() => startCalls === 1);
    resolveWinner();

    const responses = [
      normalizeResponse(await response1),
      normalizeResponse(await response2)
    ];
    const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
    t.same(statuses, [200, 409], "exactly one winner (200), one loser (409)");
    const loser = responses.find((r) => r.status === 409);
    t.match(
      loser.body?.error || JSON.stringify(loser.body),
      /already being processed/i
    );
    t.equal(
      startCalls,
      1,
      "store startProcessing should be called exactly once"
    );

    await teardown();
  });

  // Test: Concurrent processing (explicit state, no timing)
  test(`${adapter.name} - detects concurrent processing with 409`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    // Pre-populate store with "processing" state for the SAME payload the
    // request will send, so it is a same-payload retry (-> 409), not a
    // fingerprint-mismatch (which would be -> 422).
    const scopeToken = await deriveScopeToken({
      method: "POST",
      url: "/test"
    });
    const fingerprint = await generateScopedFingerprint(
      scopeToken,
      JSON.stringify({ foo: "bar" })
    );
    await store.startProcessing(
      buildRecordKey(scopeToken, "concurrent-key-12345678901"),
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

  // Test: Torn lookup (byKey miss, byFingerprint hit for the same key) with a
  // processing record must 409, not execute the handler uncached.
  test(`${adapter.name} - torn lookup with processing fingerprint record returns 409`, async (t) => {
    let startProcessingCalls = 0;
    const store = {
      lookup: async (key, fingerprint) => {
        return {
          byKey: null,
          byFingerprint: {
            key: key,
            fingerprint: fingerprint,
            status: "processing",
            expiresAt: Date.now() + 60000
          }
        };
      },
      startProcessing: async () => {
        startProcessingCalls++;
      },
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
        headers: { "idempotency-key": "torn-key-123456789012" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 409, "should return 409 for in-flight request");
    t.equal(callCount, 0, "handler must not run for an in-flight key");
    t.equal(startProcessingCalls, 0, "must not attempt to claim a claimed key");

    await teardown();
  });

  // Test: Torn lookup where the fingerprint record is complete must replay the
  // cached response instead of falling through to the handler.
  test(`${adapter.name} - torn lookup with complete fingerprint record replays`, async (t) => {
    const store = {
      lookup: async (key, fingerprint) => {
        return {
          byKey: null,
          byFingerprint: {
            key: key,
            fingerprint: fingerprint,
            status: "complete",
            response: {
              status: 201,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "created" })
            },
            expiresAt: Date.now() + 60000
          }
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
      return res.send({ message: "executed" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "torn-key-223456789012" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 201, "should replay the cached response");
    t.equal(callCount, 0, "handler must not run for a completed key");
    t.equal(
      response.body?.message,
      "created",
      "replayed body, not handler body"
    );

    await teardown();
  });

  // Test: Torn lookup at the exists-error recheck site with a processing
  // record must 409. Exercises the reconcileLookup wiring at the
  // IdempotencyKeyExistsError recheck: the initial lookup misses,
  // startProcessing loses the race, and the recheck observes the torn shape
  // {byKey: null, byFingerprint: <same-key record>}.
  test(`${adapter.name} - torn recheck with processing fingerprint record returns 409`, async (t) => {
    let lookupCalls = 0;
    let startProcessingCalls = 0;
    const store = {
      lookup: async (key, fingerprint) => {
        lookupCalls++;
        if (lookupCalls === 1) {
          return { byKey: null, byFingerprint: null };
        }
        return {
          byKey: null,
          byFingerprint: {
            key: key,
            fingerprint: fingerprint,
            status: "processing",
            expiresAt: Date.now() + 60000
          }
        };
      },
      startProcessing: async () => {
        startProcessingCalls++;
        throw new IdempotencyKeyExistsError("key exists");
      },
      complete: async () => {}
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    let callCount = 0;
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ message: "executed" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "torn-recheck-12345678901" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 409, "should return 409 for in-flight request");
    t.equal(callCount, 0, "handler must not run for an in-flight key");
    t.equal(startProcessingCalls, 1, "startProcessing should be called once");
    t.equal(lookupCalls, 2, "recheck lookup should be issued once");

    await teardown();
  });

  // Test: Torn lookup at the exists-error recheck site with a complete record
  // must replay the cached response instead of falling through to the 409
  // fallback (getCachedResponse reads byKey, so the recheck promotion is what
  // makes the completed winner's response visible to the loser).
  test(`${adapter.name} - torn recheck with complete fingerprint record replays`, async (t) => {
    let lookupCalls = 0;
    let startProcessingCalls = 0;
    const store = {
      lookup: async (key, fingerprint) => {
        lookupCalls++;
        if (lookupCalls === 1) {
          return { byKey: null, byFingerprint: null };
        }
        return {
          byKey: null,
          byFingerprint: {
            key: key,
            fingerprint: fingerprint,
            status: "complete",
            response: {
              status: 201,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "created" })
            },
            expiresAt: Date.now() + 60000
          }
        };
      },
      startProcessing: async () => {
        startProcessingCalls++;
        throw new IdempotencyKeyExistsError("key exists");
      },
      complete: async () => {}
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });

    let callCount = 0;
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ message: "executed" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/test",
        headers: { "idempotency-key": "torn-recheck-22345678901" },
        body: { data: "test" }
      })
    );

    t.equal(response.status, 201, "should replay the cached response");
    t.equal(callCount, 0, "handler must not run for a completed key");
    t.equal(
      response.body?.message,
      "created",
      "replayed body, not handler body"
    );
    t.equal(startProcessingCalls, 1, "startProcessing should be called once");
    t.equal(lookupCalls, 2, "recheck lookup should be issued once");

    const replayHeader =
      response.headers["x-idempotent-replayed"] ||
      response.headers["X-Idempotent-Replayed"];
    t.equal(replayHeader, "true", "should have replay header");

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

  // Test: Resilience retries until success
  test(`${adapter.name} - withResilience retries until success`, async (t) => {
    let attempts = 0;
    const flakyStore = {
      lookup: () => {
        attempts++;
        if (attempts < 3) throw new Error("Transient error");
        return Promise.resolve({ byKey: null, byFingerprint: null });
      },
      startProcessing: () => Promise.resolve(),
      complete: () => Promise.resolve()
    };

    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store: flakyStore });

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

    t.equal(response.status, 200, "should succeed after retries");
    t.equal(attempts, 3, "should retry 3 times");

    await teardown();
  });

  // Test: The same key on another route is another operation
  test(`${adapter.name} - the same key and body on another route runs independently`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    const calls = [];

    mount("POST", "/api", middleware, async (req, res) => {
      calls.push("api");
      return res.send({ route: "api" });
    });

    mount("POST", "/other", middleware, async (req, res) => {
      calls.push("other");
      return res.send({ route: "other" });
    });

    const headers = { "idempotency-key": "route-key-1234567890123" };
    const body = { foo: "bar" };

    const first = normalizeResponse(
      await request({ method: "POST", path: "/api", headers, body })
    );
    const second = normalizeResponse(
      await request({ method: "POST", path: "/other", headers, body })
    );

    t.equal(first.status, 200, "the first route should succeed");
    t.equal(second.status, 200, "another route must not conflict");
    t.same(calls, ["api", "other"], "both handlers must run");
    t.equal(second.body?.route, "other", "the second route's own response");
    t.notOk(
      second.headers["x-idempotent-replayed"] ||
        second.headers["X-Idempotent-Replayed"],
      "must not replay the other route's record"
    );

    await teardown();
  });

  // Test: The fingerprint conflict is a same-route question
  test(`${adapter.name} - a different key with the same body on another route is not a conflict`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    let otherCalls = 0;

    mount("POST", "/api", middleware, async (req, res) => {
      return res.send({ route: "api" });
    });

    mount("POST", "/other", middleware, async (req, res) => {
      otherCalls++;
      return res.send({ route: "other" });
    });

    const body = { foo: "bar" };

    await request({
      method: "POST",
      path: "/api",
      headers: { "idempotency-key": "conflict-key-12345678901" },
      body
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/other",
        headers: { "idempotency-key": "conflict-key-22345678901" },
        body
      })
    );

    t.equal(
      response.status,
      200,
      "another route is not a fingerprint conflict"
    );
    t.equal(otherCalls, 1, "the other route's handler must run");
    t.equal(response.body?.route, "other", "the other route's own response");

    await teardown();
  });

  // Test: The method is part of the operation
  test(`${adapter.name} - the same key and body on another method runs independently`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });
    const calls = [];

    mount("POST", "/method-test", middleware, async (req, res) => {
      calls.push("POST");
      return res.send({ method: "POST" });
    });

    mount("PATCH", "/method-test", middleware, async (req, res) => {
      calls.push("PATCH");
      return res.send({ method: "PATCH" });
    });

    const headers = { "idempotency-key": "method-key-123456789012" };
    const body = { foo: "bar" };

    const first = normalizeResponse(
      await request({ method: "POST", path: "/method-test", headers, body })
    );
    const second = normalizeResponse(
      await request({ method: "PATCH", path: "/method-test", headers, body })
    );

    t.equal(first.status, 200, "the POST should succeed");
    t.equal(second.status, 200, "the PATCH must not replay the POST");
    t.same(calls, ["POST", "PATCH"], "both handlers must run");
    t.equal(second.body?.method, "PATCH", "the PATCH's own response");
    t.notOk(
      second.headers["x-idempotent-replayed"] ||
        second.headers["X-Idempotent-Replayed"],
      "must not replay the POST's record"
    );

    await teardown();
  });

  // Test: A record from another route is invisible here
  test(`${adapter.name} - a record seeded under another route is not replayed`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    const otherScope = await deriveScopeToken({
      method: "POST",
      url: "/elsewhere"
    });
    const otherFingerprint = await generateScopedFingerprint(
      otherScope,
      JSON.stringify({ foo: "bar" })
    );
    const elsewhereKey = buildRecordKey(
      otherScope,
      "elsewhere-key-123456789012"
    );
    await store.startProcessing(elsewhereKey, otherFingerprint, 60000);
    await store.complete(elsewhereKey, {
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ elsewhere: true })
    });

    let handlerCalls = 0;
    mount("POST", "/here", middleware, async (req, res) => {
      handlerCalls++;
      return res.send({ here: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/here",
        headers: { "idempotency-key": "elsewhere-key-123456789012" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 200, "the request should run on this route");
    t.equal(handlerCalls, 1, "the handler must run");
    t.equal(response.body?.here, true, "this route's own response");
    t.notOk(
      response.headers["x-idempotent-replayed"] ||
        response.headers["X-Idempotent-Replayed"],
      "must not replay another route's record"
    );

    await teardown();
  });

  // Test: The stored identity is the one the adapter derives for the request
  test(`${adapter.name} - composes the stored identity from the request`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({ store });

    const scopeToken = await deriveScopeToken({
      method: "POST",
      url: "/seed"
    });
    const recordKey = buildRecordKey(scopeToken, "seeded-key-123456789012");
    const fingerprint = await generateScopedFingerprint(
      scopeToken,
      JSON.stringify({ foo: "bar" })
    );
    await store.startProcessing(recordKey, fingerprint, 60000);
    await store.complete(recordKey, {
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seeded: true })
    });

    let handlerCalls = 0;
    mount("POST", "/seed", middleware, async (req, res) => {
      handlerCalls++;
      return res.send({ handler: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/seed",
        headers: { "idempotency-key": "seeded-key-123456789012" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 201, "the seeded record should replay");
    t.equal(handlerCalls, 0, "the handler must not run for a seeded record");
    t.equal(response.body?.seeded, true, "replays the seeded body");
    t.equal(
      response.headers["x-idempotent-replayed"] ||
        response.headers["X-Idempotent-Replayed"],
      "true",
      "replays with the replay header"
    );

    await teardown();
  });

  // Test: The same key and body for another principal is another operation
  test(`${adapter.name} - the same key and body for another principal runs independently`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({
      store,
      scope: adapter.scope
    });
    const calls = [];

    mount("POST", "/principal", middleware, async (req, res) => {
      calls.push("handler");
      return res.send({ ok: true });
    });

    const headers = { "idempotency-key": "principal-key-1234567890" };
    const body = { foo: "bar" };

    const first = normalizeResponse(
      await request({
        method: "POST",
        path: "/principal",
        headers: { ...headers, "x-principal": "alice" },
        body
      })
    );
    const second = normalizeResponse(
      await request({
        method: "POST",
        path: "/principal",
        headers: { ...headers, "x-principal": "bob" },
        body
      })
    );

    t.equal(first.status, 200, "the first principal should succeed");
    t.equal(second.status, 200, "another principal must not replay");
    t.equal(calls.length, 2, "both requests must run the handler");
    t.notOk(
      second.headers["x-idempotent-replayed"] ||
        second.headers["X-Idempotent-Replayed"],
      "must not replay the other principal's record"
    );

    await teardown();
  });

  // Test: An unresolved principal falls back to the operation-only identity
  test(`${adapter.name} - a scope that returns undefined falls back to the route`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({
      store,
      scope: () => undefined
    });
    let calls = 0;

    mount("POST", "/fallback", middleware, async (req, res) => {
      calls++;
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/fallback",
        headers: { "idempotency-key": "fallback-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 200, "the request must not fail");
    t.equal(calls, 1, "the handler must run");

    await teardown();
  });

  // Test: A throwing scope falls back to the operation-only identity
  test(`${adapter.name} - a scope that throws falls back to the route`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({
      store,
      scope: () => {
        throw new Error("no principal");
      }
    });
    let calls = 0;

    mount("POST", "/fallback", middleware, async (req, res) => {
      calls++;
      return res.send({ ok: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/fallback",
        headers: { "idempotency-key": "throwing-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 200, "the request must not fail");
    t.equal(calls, 1, "the handler must run");

    await teardown();
  });

  // Test: A throwing scope must not widen to another principal's records
  test(`${adapter.name} - a throwing scope does not replay another principal's record`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const principalScope = await deriveScopeToken({
      method: "POST",
      url: "/fallback",
      principal: "alice"
    });
    const principalKey = buildRecordKey(
      principalScope,
      "fallback-key-12345678901"
    );
    const principalFingerprint = await generateScopedFingerprint(
      principalScope,
      JSON.stringify({ foo: "bar" })
    );
    await store.startProcessing(principalKey, principalFingerprint, 60000);
    await store.complete(principalKey, {
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principal: "alice" })
    });

    const middleware = adapter.createMiddleware({
      store,
      scope: () => {
        throw new Error("no principal");
      }
    });
    let calls = 0;

    mount("POST", "/fallback", middleware, async (req, res) => {
      calls++;
      return res.send({ route: true });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/fallback",
        headers: { "idempotency-key": "fallback-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(
      response.status,
      200,
      "the request must run under the route-only identity"
    );
    t.equal(calls, 1, "the handler must run");
    t.equal(response.body?.route, true, "its own response, not alice's");
    t.notOk(
      response.headers["x-idempotent-replayed"] ||
        response.headers["X-Idempotent-Replayed"],
      "must not replay alice's record"
    );

    await teardown();
  });

  // Test: The same principal's retry replays its own record
  test(`${adapter.name} - the same principal's retry replays`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const middleware = adapter.createMiddleware({
      store,
      scope: adapter.scope
    });
    let calls = 0;

    mount("POST", "/principal-replay", middleware, async (req, res) => {
      calls++;
      return res.send({ calls });
    });

    const headers = {
      "idempotency-key": "principal-replay-key-123456",
      "x-principal": "alice"
    };
    const body = { foo: "bar" };

    const first = normalizeResponse(
      await request({
        method: "POST",
        path: "/principal-replay",
        headers,
        body
      })
    );
    const second = normalizeResponse(
      await request({
        method: "POST",
        path: "/principal-replay",
        headers,
        body
      })
    );

    t.equal(first.status, 200, "the first request should succeed");
    t.equal(second.status, 200, "the retry should replay");
    t.equal(calls, 1, "the handler must run once");
    t.equal(
      second.headers["x-idempotent-replayed"] ||
        second.headers["X-Idempotent-Replayed"],
      "true",
      "the retry must carry the replay header"
    );

    await teardown();
  });

  // Test: A missing principal replays a record stored under the route-only identity
  test(`${adapter.name} - an undefined scope replays a route-only record`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const routeToken = await deriveScopeToken({
      method: "POST",
      url: "/fallback"
    });
    const recordKey = buildRecordKey(routeToken, "fallback-key-12345678901");
    const fingerprint = await generateScopedFingerprint(
      routeToken,
      JSON.stringify({ foo: "bar" })
    );
    await store.startProcessing(recordKey, fingerprint, 60000);
    await store.complete(recordKey, {
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "seeded" })
    });

    const middleware = adapter.createMiddleware({
      store,
      scope: () => undefined
    });
    let calls = 0;

    mount("POST", "/fallback", middleware, async (req, res) => {
      calls++;
      return res.send({ route: "handler" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/fallback",
        headers: { "idempotency-key": "fallback-key-12345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 201, "the route-only record must replay");
    t.equal(calls, 0, "the handler must not run");
    t.equal(response.body?.route, "seeded", "replays the seeded body");
    t.equal(
      response.headers["x-idempotent-replayed"] ||
        response.headers["X-Idempotent-Replayed"],
      "true",
      "the retry must carry the replay header"
    );

    await teardown();
  });

  // Test: A throwing scope replays a record stored under the route-only identity
  test(`${adapter.name} - a throwing scope replays a route-only record`, async (t) => {
    const store = adapter.createStore();
    const { mount, request, teardown } = await adapter.setup();

    const routeToken = await deriveScopeToken({
      method: "POST",
      url: "/fallback"
    });
    const recordKey = buildRecordKey(routeToken, "fallback-key-22345678901");
    const fingerprint = await generateScopedFingerprint(
      routeToken,
      JSON.stringify({ foo: "bar" })
    );
    await store.startProcessing(recordKey, fingerprint, 60000);
    await store.complete(recordKey, {
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "seeded" })
    });

    const middleware = adapter.createMiddleware({
      store,
      scope: () => {
        throw new Error("no principal");
      }
    });
    let calls = 0;

    mount("POST", "/fallback", middleware, async (req, res) => {
      calls++;
      return res.send({ route: "handler" });
    });

    const response = normalizeResponse(
      await request({
        method: "POST",
        path: "/fallback",
        headers: { "idempotency-key": "fallback-key-22345678901" },
        body: { foo: "bar" }
      })
    );

    t.equal(response.status, 201, "the route-only record must replay");
    t.equal(calls, 0, "the handler must not run");
    t.equal(response.body?.route, "seeded", "replays the seeded body");
    t.equal(
      response.headers["x-idempotent-replayed"] ||
        response.headers["X-Idempotent-Replayed"],
      "true",
      "the retry must carry the replay header"
    );

    await teardown();
  });
}
