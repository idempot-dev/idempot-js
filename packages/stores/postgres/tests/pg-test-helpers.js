import sinon from "sinon";

/**
 * Creates an in-memory store that simulates PostgreSQL table operations
 * @returns {Map<string, any>}
 */
function createInMemoryStore() {
  return new Map();
}

/**
 * Parses SQL to extract the operation type
 * @param {string} sql
 * @returns {{operation: string, table: string}|null}
 */
function parseSql(sql) {
  const normalized = sql.trim().toUpperCase();
  if (normalized.startsWith("INSERT")) {
    return { operation: "INSERT", table: "idempotency_records" };
  }
  if (normalized.startsWith("UPDATE")) {
    return { operation: "UPDATE", table: "idempotency_records" };
  }
  if (normalized.startsWith("DELETE") && normalized.includes("EXPIRES_AT")) {
    return { operation: "DELETE_EXPIRED", table: "idempotency_records" };
  }
  if (normalized.startsWith("SELECT")) {
    return { operation: "LOOKUP", table: "idempotency_records" };
  }
  if (normalized.startsWith("CREATE")) {
    return { operation: "CREATE", table: null };
  }
  return null;
}

/**
 * Creates a fake PostgreSQL pool for unit testing using sinon fakes
 * Uses an in-memory Map to simulate database operations
 *
 * @returns {object} Fake PostgreSQL pool with sinon spies
 */
export function createFakePgPool() {
  const store = createInMemoryStore();

  const pool = {
    __store: store,
    /**
     * Optional injected error thrown by INSERT operations.
     * @type {Error | null}
     */
    __insertError: null,

    query: sinon.fake(async (sql, params = []) => {
      const parsed = parseSql(sql);

      switch (parsed?.operation) {
        case "CREATE": {
          return { rows: [], rowCount: 0 };
        }

        case "LOOKUP": {
          // Emulate the real statement: select rows matching key OR
          // fingerprint that are not expired (the expiry guard runs inside
          // each OR arm).
          const [key, now, fingerprint] = params;
          const rows = [];
          for (const record of store.values()) {
            if (
              record.expires_at > now &&
              (record.key === key || record.fingerprint === fingerprint)
            ) {
              rows.push(record);
            }
          }
          return { rows, rowCount: rows.length };
        }

        case "DELETE_EXPIRED": {
          // Emulate the real statement: purge up to 10 expired rows,
          // oldest first.
          const [now] = params;
          const expired = [];
          for (const [k, record] of store) {
            if (record.expires_at <= now) {
              expired.push([k, record]);
            }
          }
          expired.sort((a, b) => a[1].expires_at - b[1].expires_at);
          for (const [k] of expired.slice(0, 10)) {
            store.delete(k);
          }
          return { rows: [], rowCount: Math.min(expired.length, 10) };
        }

        case "INSERT": {
          if (pool.__insertError) {
            const injected = pool.__insertError;
            pool.__insertError = null;
            throw injected;
          }
          const [key, fingerprint, expiresAt] = params;
          if (store.has(key)) {
            const error = new Error(
              `duplicate key value violates unique constraint "idempotency_records_pkey"`
            );
            error.code = "23505";
            throw error;
          }
          store.set(key, {
            key,
            fingerprint,
            status: "processing",
            expires_at: expiresAt,
            response_status: null,
            response_headers: null,
            response_body: null
          });
          return { rows: [], rowCount: 1 };
        }

        case "UPDATE": {
          const [responseStatus, responseHeaders, responseBody, key] = params;
          const record = store.get(key);
          if (record) {
            store.set(key, {
              ...record,
              status: "complete",
              response_status: responseStatus,
              response_headers: responseHeaders,
              response_body: responseBody
            });
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }

        default:
          return { rows: [], rowCount: 0 };
      }
    }),

    end: sinon.fake.resolves(undefined)
  };

  return pool;
}
