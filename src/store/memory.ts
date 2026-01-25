import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export class MemoryIdempotencyStore implements IdempotencyStore {
  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    throw new Error("Not implemented");
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
