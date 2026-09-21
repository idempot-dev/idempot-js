import sinon from "sinon";

/**
 * Creates an in-memory store that simulates MySQL table operations
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
  return null;
}

/**
 * Creates a fake MySQL pool for unit testing using sinon
 * Uses an in-memory Map to simulate database operations
 *
 * @returns {object} Fake MySQL pool with sinon spies
 */
export function createFakeMysqlPool() {
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

      if (!parsed) {
        return [[], []];
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
        if (sql.toUpperCase().includes("SELECT")) {
          // Batched lookup: DELETE + guarded SELECT in one
          // multipleStatements query. SELECT params: key, now,
          // fingerprint, now.
          if (!sql.toUpperCase().includes("EXPIRES_AT > ?")) {
            // Guard drift: the fake refuses to emulate a lookup without
            // the expiry guard so store tests fail loudly.
            return [[{ affectedRows: deleted }, []], []];
          }
          const [, key, selectNow, fingerprint] = params;
          const rows = [];
          for (const record of store.values()) {
            if (
              record.expires_at > selectNow &&
              (record.key === key || record.fingerprint === fingerprint)
            ) {
              rows.push(record);
            }
          }
          return [[{ affectedRows: deleted }, rows], []];
        }
        return [{ affectedRows: deleted }, []];
      }

      if (parsed.operation === "INSERT") {
        if (pool.__insertError) {
          const injected = pool.__insertError;
          pool.__insertError = null;
          throw injected;
        }
        const [key, fingerprint, expiresAt] = params;
        if (store.has(key)) {
          const error = new Error(`Duplicate entry '${key}' for key 'PRIMARY'`);
          error.code = "ER_DUP_ENTRY";
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
        return [{ affectedRows: 1 }, []];
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
          return [{ affectedRows: 1 }, []];
        }
        return [{ affectedRows: 0 }, []];
      }

      if (parsed.operation === "SELECT") {
        const normalizedSql = sql.toUpperCase();

        if (
          normalizedSql.includes("`KEY` = ?") &&
          normalizedSql.includes("FINGERPRINT = ?") &&
          normalizedSql.includes("EXPIRES_AT > ?")
        ) {
          // Guarded lookup: params are key, now, fingerprint, now. The
          // classification above anchors the expiry guard, so guard drift
          // never reaches this branch and store tests fail loudly instead
          // of passing on drifted SQL.
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
          return [rows, []];
        }
      }

      return [[], []];
    }),

    end: sinon.fake.resolves(undefined)
  };

  return pool;
}
