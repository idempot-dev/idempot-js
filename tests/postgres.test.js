import { test } from "tap";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

const createMockPool = (responses = []) => {
  let callIndex = 0;
  const calls = [];

  return {
    query: async (sql, params) => {
      calls.push({ sql, params });
      const response = responses[callIndex] || { rows: [], rowCount: 0 };
      callIndex++;

      if (response.throw) {
        throw response.throw;
      }

      return {
        rows: response.rows || [],
        rowCount: response.rowCount ?? response.rows?.length ?? 0
      };
    },
    end: async () => {},
    _calls: calls,
    _callCount: () => callIndex
  };
};

test("PostgresIdempotencyStore - initialization", async (t) => {
  const mockPool = createMockPool();
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });
  t.ok(store, "store should be created");
  t.ok(store.pool, "pool should be created");
  t.end();
});

test("PostgresIdempotencyStore - init creates schema", async (t) => {
  const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.init();

  t.ok(mockPool._calls.length > 0, "should have called query");
  t.ok(mockPool._calls[0].sql.includes("CREATE TABLE"), "should create table");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - lookup with empty store", async (t) => {
  const mockPool = createMockPool([
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 0 }
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - lookup returns parsed records", async (t) => {
  const mockPool = createMockPool([
    {
      rows: [
        {
          key: "test-key",
          fingerprint: "test-fp",
          status: "complete",
          response_status: 200,
          response_headers: '{"content-type":"application/json"}',
          response_body: '{"result":"ok"}',
          expires_at: Date.now() + 60000
        }
      ],
      rowCount: 1
    },
    {
      rows: [
        {
          key: "test-key",
          fingerprint: "test-fp",
          status: "complete",
          response_status: 200,
          response_headers: '{"content-type":"application/json"}',
          response_body: '{"result":"ok"}',
          expires_at: Date.now() + 60000
        }
      ],
      rowCount: 1
    }
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "should find by key");
  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.equal(result.byKey?.response?.status, 200, "response status should match");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - lookup handles missing response", async (t) => {
  const mockPool = createMockPool([
    {
      rows: [
        {
          key: "test-key",
          fingerprint: "test-fp",
          status: "processing",
          expires_at: Date.now() + 60000
        }
      ],
      rowCount: 1
    },
    {
      rows: [
        {
          key: "test-key",
          fingerprint: "test-fp",
          status: "processing",
          expires_at: Date.now() + 60000
        }
      ],
      rowCount: 1
    }
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "should find by key");
  t.equal(result.byKey?.response, undefined, "response should be undefined");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - startProcessing creates record", async (t) => {
  const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.startProcessing("test-key", "test-fp", 60000);

  t.ok(mockPool._calls.length > 0, "should have called query");
  const call = mockPool._calls[0];
  t.ok(call.sql.includes("INSERT"), "should be insert query");
  t.equal(call.params[0], "test-key", "key should match");
  t.equal(call.params[1], "test-fp", "fingerprint should match");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - complete updates record", async (t) => {
  const mockPool = createMockPool([
    { rows: [{ key: "test-key" }], rowCount: 1 }
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result":"ok"}'
  });

  t.ok(mockPool._calls.length > 0, "should have called query");
  const call = mockPool._calls[0];
  t.ok(call.sql.includes("UPDATE"), "should be update query");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - cleanup removes expired records", async (t) => {
  const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.cleanup();

  t.ok(mockPool._calls.length > 0, "should have called query");
  const call = mockPool._calls[0];
  t.ok(call.sql.includes("DELETE"), "should be delete query");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - complete throws on missing key", async (t) => {
  const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err) {
    t.match(
      err.message,
      /No record found/,
      "should throw error for missing key"
    );
  }

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const mockPool = createMockPool([
    { rows: [], rowCount: 0 }, // DELETE expired
    { rows: [], rowCount: 0 }, // SELECT by key (key-2)
    {
      rows: [
        {
          key: "key-1",
          fingerprint: "fp-1",
          status: "processing",
          expires_at: Date.now() + 60000
        }
      ],
      rowCount: 1
    } // SELECT by fingerprint
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - lookup deletes expired records", async (t) => {
  const mockPool = createMockPool([
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 0 }
  ]);
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.lookup("test", "test");

  t.ok(mockPool._calls.length > 0, "should have called query");
  const firstCall = mockPool._calls[0];
  t.ok(
    firstCall.sql.includes("DELETE") && firstCall.sql.includes("expires_at"),
    "should delete expired"
  );

  await store.close();
  t.end();
});

test("PostgresIdempotencyStore - close ends pool", async (t) => {
  let ended = false;
  const mockPool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    end: async () => {
      ended = true;
    }
  };
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test",
    pool: mockPool
  });

  await store.close();

  t.ok(ended, "pool should be ended");
  t.end();
});
