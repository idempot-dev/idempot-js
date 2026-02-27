/** @typedef {import("./interface.js").IdempotencyStore} IdempotencyStore */
/** @typedef {import("./interface.js").IdempotencyRecord} IdempotencyRecord */

/**
 * @typedef {Object} CloudflareKvIdempotencyStoreOptions
 * @property {any} kv - KV namespace (Workers binding or Miniflare mock)
 */

/**
 * @implements {IdempotencyStore}
 */
export class CloudflareKvIdempotencyStore {
  /**
   * @type {any}
   */
  kv;

  /**
   * @param {CloudflareKvIdempotencyStoreOptions} options
   */
  constructor(options) {
    if (!options.kv) {
      throw new Error("KV namespace is required");
    }
    this.kv = options.kv;
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    const [byKeyResult, byFingerprintResult] = await Promise.all([
      this.kv.get(["idempotency", key]),
      this.kv.get(["idempotency", "fp", fingerprint])
    ]);

    const byKey = byKeyResult ? JSON.parse(byKeyResult) : null;

    let byFingerprint = null;
    if (byFingerprintResult) {
      const recordJson = await this.kv.get(["idempotency", byFingerprintResult]);
      byFingerprint = recordJson ? JSON.parse(recordJson) : null;
    }

    return { byKey, byFingerprint };
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    const record = {
      key,
      fingerprint,
      status: "processing",
      expiresAt: Date.now() + ttlMs
    };

    const ttlSeconds = Math.ceil(ttlMs / 1000);

    await Promise.all([
      this.kv.put(["idempotency", key], JSON.stringify(record), { expirationTtl: ttlSeconds }),
      this.kv.put(["idempotency", "fp", fingerprint], key, { expirationTtl: ttlSeconds })
    ]);
  }

  /**
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    const existingJson = await this.kv.get(["idempotency", key]);
    if (!existingJson) {
      throw new Error(`No record found for key: ${key}`);
    }

    const record = JSON.parse(existingJson);
    const ttlMs = record.expiresAt - Date.now();
    
    if (ttlMs <= 0) {
      throw new Error(`Record expired or missing for key: ${key}`);
    }

    const updatedRecord = {
      ...record,
      status: "complete",
      response
    };

    await this.kv.put(["idempotency", key], JSON.stringify(updatedRecord), { 
      expirationTtl: Math.ceil(ttlMs / 1000) 
    });
  }

  /**
   * @returns {Promise<void>}
   */
  async cleanup() {
    const list = this.kv.list({ prefix: ["idempotency"] });
    const keysToDelete = [];
    
    for await (const entry of list) {
      const keyParts = entry.key;
      if (keyParts[1] === "fp") {
        // Fingerprint entry stores the key, get it first
        const key = await this.kv.get(["idempotency", "fp", keyParts[2]]);
        if (key) {
          const recordJson = await this.kv.get(["idempotency", key]);
          if (recordJson) {
            const record = JSON.parse(recordJson);
            if (record.expiresAt < Date.now()) {
              keysToDelete.push(entry.key);
            }
          }
        }
      }
    }

    await Promise.all(keysToDelete.map(key => this.kv.delete(key)));
  }
}
