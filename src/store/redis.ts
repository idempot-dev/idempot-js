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

  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    // Pipeline for parallel execution
    const pipeline = this.client.pipeline();
    pipeline.get(`idempotency:${key}`);
    pipeline.get(`fingerprint:${fingerprint}`);
    const results = await pipeline.exec();

    if (!results) {
      return { byKey: null, byFingerprint: null };
    }

    const [[, byKeyJson], [, fpKeyJson]] = results as [
      [Error | null, string | null],
      [Error | null, string | null]
    ];

    // Parse record by key
    const byKey = byKeyJson ? JSON.parse(byKeyJson) : null;

    // If fingerprint found, fetch that record
    let byFingerprint: IdempotencyRecord | null = null;
    if (fpKeyJson) {
      const recordJson = await this.client.get(`idempotency:${fpKeyJson}`);
      byFingerprint = recordJson ? JSON.parse(recordJson) : null;
    }

    return { byKey, byFingerprint };
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
      expiresAt: Date.now() + ttlMs,
    };

    const ttlSeconds = Math.ceil(ttlMs / 1000);

    // Pipeline both writes
    const pipeline = this.client.pipeline();
    pipeline.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(record));
    pipeline.setex(`fingerprint:${fingerprint}`, ttlSeconds, key);
    await pipeline.exec();
  }

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
