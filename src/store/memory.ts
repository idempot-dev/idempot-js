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
    throw new Error("Not implemented");
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async cleanup(): Promise<void> {
    throw new Error("Not implemented");
  }
}
