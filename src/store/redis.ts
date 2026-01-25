import type { Redis } from "ioredis";
import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export interface RedisIdempotencyStoreOptions {
  client: Redis;
}

export class RedisIdempotencyStore implements IdempotencyStore {
  private client: Redis;

  constructor(options: RedisIdempotencyStoreOptions) {
    this.client = options.client;
  }

  // Placeholder methods to satisfy interface
  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    return { byKey: null, byFingerprint: null };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {}

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {}

  async cleanup(): Promise<void> {}
}
