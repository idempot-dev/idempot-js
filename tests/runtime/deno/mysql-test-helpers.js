/**
 * Matches the store's guarded OR lookup only when the expiry predicate sits
 * inside BOTH arms. A whole-statement substring test (`EXPIRES_AT > ?`)
 * would accept a statement that dropped the guard from one arm, emulate it
 * with the guard applied to both arms, and let the leak this PR fixes pass
 * silently.
 * @type {RegExp}
 */
const GUARDED_OR_LOOKUP =
  /\(\s*`?KEY`?\s*=\s*\?\s+AND\s+EXPIRES_AT\s*>\s*\?\s*\)\s*OR\s*\(\s*FINGERPRINT\s*=\s*\?\s+AND\s+EXPIRES_AT\s*>\s*\?\s*\)/i;

/**
 * Extracts the LIMIT from a purge DELETE so the fake reclaims no more rows
 * than the real store's statement does.
 * @type {RegExp}
 */
const DELETE_LIMIT = /\bLIMIT\s+(\d+)/i;

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
        // The real store's DELETE carries `LIMIT 10`, so the fake must
        // reclaim at most that many expired rows (oldest first, matching
        // the index order the real drivers walk). A full-table sweep would
        // erase the exact condition the lookup guard exists for: more
        // expired rows than the purge batch can reclaim.
        const limitMatch = DELETE_LIMIT.exec(sql);
        const limit = limitMatch ? Number(limitMatch[1]) : Infinity;
        const purgeable = [...store.entries()]
          .filter(([, record]) => record.expires_at <= now)
          .sort((a, b) => a[1].expires_at - b[1].expires_at)
          .slice(0, limit);
        for (const [key] of purgeable) {
          store.delete(key);
        }
        return [{ affectedRows: purgeable.length }];
      }

      if (normalized.startsWith("INSERT")) {
        const [key, fingerprint, expiresAt] = params;
        if (store.has(key)) {
          throw new Error(`Duplicate entry '${key}' for key 'PRIMARY'`);
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
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith("UPDATE")) {
        if (normalized.includes("RESPONSE_STATUS = NULL")) {
          // Conditional reclaim: the row is overwritten only when it is
          // expired, exactly like the SQL's expires_at guard.
          const [fingerprint, expiresAt, key, now] = params;
          const record = store.get(key);
          if (record && record.expires_at <= now) {
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
          return [{ affectedRows: 0 }];
        }
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
        // Guarded lookup: params are key, now, fingerprint, now. The
        // classification anchors the expiry guard in each OR arm, so guard
        // drift never reaches this branch and the deno store tests fail
        // loudly instead of passing on drifted SQL.
        if (GUARDED_OR_LOOKUP.test(normalized)) {
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
          return [rows];
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
