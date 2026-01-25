import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export class MemoryIdempotencyStore implements IdempotencyStore {
  private byKey = new Map<string, IdempotencyRecord>();
  private byFingerprint = new Map<string, IdempotencyRecord>();

  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    return {
      byKey: this.byKey.get(key) ?? null,
      byFingerprint: this.byFingerprint.get(fingerprint) ?? null
    };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
    const record: IdempotencyRecord = {
      key,
      fingerprint,
      status: "processing",
      expiresAt: Date.now() + ttlMs
    };

    this.byKey.set(key, record);
    this.byFingerprint.set(fingerprint, record);
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    const record = this.byKey.get(key);
    if (!record) {
      throw new Error(`No record found for key: ${key}`);
    }

    record.status = "complete";
    record.response = response;

    // Update both indexes
    this.byKey.set(key, record);
    this.byFingerprint.set(record.fingerprint, record);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();

    // Find expired keys
    const expiredKeys: string[] = [];
    for (const [key, record] of this.byKey) {
      if (record.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }

    // Remove from both indexes
    for (const key of expiredKeys) {
      const record = this.byKey.get(key);
      if (record) {
        this.byKey.delete(key);
        this.byFingerprint.delete(record.fingerprint);
      }
    }
  }
}
