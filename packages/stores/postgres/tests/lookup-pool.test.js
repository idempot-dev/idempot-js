import { test } from "tap";
import { PreparedLookupPool } from "../lookup-pool.js";

/**
 * Minimal fake client mirroring the pg.Client surface the pool uses:
 * connect(), query(config), end(), on("error").
 * @param {Object} [overrides]
 * @returns {any}
 */
function createFakeClient({
  connectResult = Promise.resolve(),
  queryResult = { rows: [] },
  queryError = null
} = {}) {
  const calls = { query: 0, end: 0 };
  const client = {
    calls,
    handlers: {},
    on(event, handler) {
      client.handlers[event] = handler;
    },
    connect: () => connectResult,
    end: () => {
      calls.end += 1;
      return Promise.resolve();
    },
    query: async (_config) => {
      calls.query += 1;
      if (queryError) throw queryError;
      return queryResult;
    }
  };
  return client;
}

const OPTIONS = {
  clientFactory: () => createFakeClient(),
  statementName: "stmt",
  statementText: "SELECT 1",
  size: 2
};

test("PreparedLookupPool - size 0 keeps the pool empty and signals fallback", async (t) => {
  const pool = new PreparedLookupPool({ ...OPTIONS, size: 0 });
  const result = await pool.query([]);
  t.equal(result, null, "empty pool must signal fallback");
  await pool.end();
  t.end();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("PreparedLookupPool - query before clients are ready returns null", async (t) => {
  // Hold the connect promise open: the client never becomes ready.
  let releaseConnect;
  const factory = () =>
    createFakeClient({
      connectResult: new Promise((resolve) => {
        releaseConnect = resolve;
      })
    });
  const pool = new PreparedLookupPool({ ...OPTIONS, clientFactory: factory });

  const result = await pool.query([1, 2, 3]);
  t.equal(result, null, "unready pool must signal fallback with null");

  releaseConnect();
  await flush();
  await pool.end();
  t.end();
});

test("PreparedLookupPool - ready clients receive named statement queries", async (t) => {
  const clients = [];
  const factory = () => {
    const client = createFakeClient();
    clients.push(client);
    return client;
  };
  const pool = new PreparedLookupPool({ ...OPTIONS, clientFactory: factory });
  await flush();

  const result = await pool.query(["k", 1, "fp"]);
  t.same(result, { rows: [] }, "should return the client's result");
  t.equal(clients[0].calls.query, 1, "query should hit a dedicated client");
  t.equal(clients[1].calls.query, 0, "round-robin: only one client used");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - round-robins across ready clients", async (t) => {
  const clients = [];
  const factory = () => {
    const client = createFakeClient();
    clients.push(client);
    return client;
  };
  const pool = new PreparedLookupPool({ ...OPTIONS, clientFactory: factory });
  await flush();

  await pool.query([]);
  await pool.query([]);
  t.equal(clients[0].calls.query, 1, "first query on first client");
  t.equal(clients[1].calls.query, 1, "second query on second client");

  await pool.query([]);
  t.equal(clients[0].calls.query, 2, "third query wraps to first client");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - failed query retires the client and falls back", async (t) => {
  const failing = createFakeClient({ queryError: new Error("conn lost") });
  const healthy = createFakeClient();
  const clients = [failing, healthy];
  const pool = new PreparedLookupPool({
    ...OPTIONS,
    clientFactory: () => clients.shift()
  });
  await flush();

  const result = await pool.query([]);
  t.equal(result, null, "failing client must signal fallback with null");
  t.equal(failing.calls.end, 1, "retired client should be closed");
  t.equal(healthy.calls.query, 0, "failure must not touch other clients");

  // After retirement only the healthy client remains; it serves queries.
  const next = await pool.query([]);
  t.same(next, { rows: [] }, "remaining client serves the next query");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - client error event retires the client", async (t) => {
  const client = createFakeClient();
  const pool = new PreparedLookupPool({
    ...OPTIONS,
    clientFactory: () => client,
    size: 1
  });
  await flush();

  const before = await pool.query([]);
  t.same(before, { rows: [] }, "ready client serves queries");

  client.handlers.error(new Error("socket hangup"));
  const after = await pool.query([]);
  t.equal(after, null, "retired client leaves the pool empty");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - failed connect retires the slot", async (t) => {
  const factory = () =>
    createFakeClient({ connectResult: Promise.reject(new Error("refused")) });
  const pool = new PreparedLookupPool({
    ...OPTIONS,
    clientFactory: factory,
    size: 1
  });
  await flush();

  const result = await pool.query([]);
  t.equal(result, null, "failed connect must leave no ready client");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - routes to the least busy client when all are busy", async (t) => {
  // One client whose first query stays in flight until released.
  let releaseQuery;
  const client = {
    calls: { query: 0, end: 0 },
    handlers: {},
    on(event, handler) {
      client.handlers[event] = handler;
    },
    connect: () => Promise.resolve(),
    end: () => {
      client.calls.end += 1;
      return Promise.resolve();
    },
    query: async () => {
      client.calls.query += 1;
      if (client.calls.query === 1) {
        return new Promise((resolve) => {
          releaseQuery = () => resolve({ rows: [] });
        });
      }
      return { rows: [] };
    }
  };
  const pool = new PreparedLookupPool({
    clientFactory: () => client,
    statementName: "stmt",
    statementText: "SELECT 1",
    size: 1
  });
  await flush();

  // First query in flight: the client is busy.
  const inFlight = pool.query([]);
  const second = await pool.query([]);
  t.same(second, { rows: [] }, "all-busy routing still serves the query");
  t.equal(client.calls.query, 2, "least-busy client took the second query");

  releaseQuery();
  t.same(await inFlight, { rows: [] }, "first query resolves after release");

  await pool.end();
  t.end();
});

test("PreparedLookupPool - least-busy scan prefers the less loaded client", async (t) => {
  /**
   * Client whose FIRST query stays pending until released; later
   * queries resolve immediately.
   */
  const createQueueingClient = () => {
    const client = {
      calls: { query: 0, end: 0 },
      handlers: {},
      on(event, handler) {
        client.handlers[event] = handler;
      },
      connect: () => Promise.resolve(),
      end: () => {
        client.calls.end += 1;
        return Promise.resolve();
      },
      query: async () => {
        client.calls.query += 1;
        if (client.calls.query <= 2) {
          return new Promise((resolve) => {
            pending.push(() => resolve({ rows: [] }));
          });
        }
        return { rows: [] };
      }
    };
    return client;
  };

  const pending = [];
  const clients = [];
  const pool = new PreparedLookupPool({
    clientFactory: () => {
      const client = createQueueingClient();
      clients.push(client);
      return client;
    },
    statementName: "stmt",
    statementText: "SELECT 1",
    size: 2
  });
  await flush();

  // Both clients busy with one pending query each.
  const first = pool.query([]); // -> a, pending (a: 1)
  const second = pool.query([]); // -> b, pending (b: 1)
  // All busy: least-busy scan ties at 1 and picks a; a now has 2 in flight.
  const third = pool.query([]); // -> a, pending
  // All busy again: the scan must walk past a (2) to the less loaded b (1).
  const fourth = pool.query([]); // -> b, pending
  t.equal(clients[0].calls.query, 2, "a served two queries");
  t.equal(clients[1].calls.query, 2, "b served the fourth query");

  for (const release of pending) release();
  t.same(await first, { rows: [] });
  t.same(await second, { rows: [] });
  t.same(await third, { rows: [] });
  t.same(await fourth, { rows: [] });

  await pool.end();
  t.end();
});

test("PreparedLookupPool - end closes every client once", async (t) => {
  const clients = [];
  const factory = () => {
    const client = createFakeClient();
    clients.push(client);
    return client;
  };
  const pool = new PreparedLookupPool({ ...OPTIONS, clientFactory: factory });
  await flush();

  await pool.end();
  for (const client of clients) {
    t.equal(client.calls.end, 1, "each client closed exactly once");
  }

  const after = await pool.query([]);
  t.equal(after, null, "closed pool signals fallback");
  t.end();
});
