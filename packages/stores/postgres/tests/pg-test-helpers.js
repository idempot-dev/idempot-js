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
    return { operation: "SELECT", table: "idempotency_records" };
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

    query: sinon.fake(async (sql, params = []) => {
      const parsed = parseSql(sql);

      if (!parsed) {
        return { rows: [], rowCount: 0 };
      }

      if (parsed.operation === "CREATE") {
        return { rows: [], rowCount: 0 };
      }

      if (parsed.operation === "DELETE_EXPIRED") {
        const now = params[0] || Date.now();
        let deleted = 0;
        for (const [key, record] of store) {
          if (record.expires_at <= now) {
            store.delete(key);
            deleted++;
          }
        }
        return { rows: [], rowCount: deleted };
      }

      if (parsed.operation === "INSERT") {
        const [key, fingerprint, expiresAt] = params;
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

      if (parsed.operation === "UPDATE") {
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

      if (parsed.operation === "SELECT") {
        const normalizedSql = sql.toUpperCase();

        if (normalizedSql.includes("WHERE KEY =")) {
          const [key] = params;
          const record = store.get(key);
          return { rows: record ? [record] : [], rowCount: record ? 1 : 0 };
        }

        if (normalizedSql.includes("WHERE FINGERPRINT =")) {
          const [fingerprint] = params;
          for (const record of store.values()) {
            if (record.fingerprint === fingerprint) {
              return { rows: [record], rowCount: 1 };
            }
          }
          return { rows: [], rowCount: 0 };
        }
      }

      return { rows: [], rowCount: 0 };
    }),

    end: sinon.fake.resolves(undefined)
  };

  return pool;
}
