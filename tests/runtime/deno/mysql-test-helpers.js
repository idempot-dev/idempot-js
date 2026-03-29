/**
 * Creates an in-memory store that simulates Deno MySQL operations
 * @returns {Map<string, any>}
 */
function createInMemoryStore() {
  return new Map();
}

/**
 * Creates a fake MySQL client for Deno testing
 * Uses an in-memory Map to simulate MySQL operations
 *
 * @param {Map<string, any>} [sharedStore] - Optional shared store
 * @returns {object} Fake MySQL client
 */
export function createFakeMysqlClient(sharedStore) {
  const store = sharedStore || createInMemoryStore();

  return {
    __store: store,

    async connect(_options) {
      // No-op for fake client
    },

    async execute(sql, params = []) {
      const normalized = sql.trim().toUpperCase();

      if (normalized.startsWith("DELETE")) {
        const now = params[0] || Date.now();
        let deleted = 0;
        for (const [key, record] of store) {
          if (record.expires_at <= now) {
            store.delete(key);
            deleted++;
          }
        }
        return [{ affectedRows: deleted }];
      }

      if (normalized.startsWith("INSERT")) {
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
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith("UPDATE")) {
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
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }

      if (normalized.startsWith("SELECT")) {
        if (normalized.includes("WHERE `KEY` =")) {
          const [key] = params;
          const record = store.get(key);
          return [record ? [record] : []];
        }

        if (normalized.includes("WHERE FINGERPRINT =")) {
          const [fingerprint] = params;
          for (const record of store.values()) {
            if (record.fingerprint === fingerprint) {
              return [[record]];
            }
          }
          return [[]];
        }
      }

      return [[]];
    },

    async query(sql, params = []) {
      return this.execute(sql, params);
    },

    async close() {
      // No-op for fake client
    }
  };
}
