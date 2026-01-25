import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export interface DynamoDbIdempotencyStoreOptions {
  client: DynamoDBDocumentClient;
  tableName?: string;
}

export class DynamoDbIdempotencyStore implements IdempotencyStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(options: DynamoDbIdempotencyStoreOptions) {
    this.client = options.client;
    this.tableName = options.tableName ?? "idempotency-records";
  }

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
  ): Promise<void> {
    // Placeholder
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    // Placeholder
  }

  async cleanup(): Promise<void> {
    // No-op: DynamoDB TTL handles cleanup
  }
}
