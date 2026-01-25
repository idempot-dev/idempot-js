import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
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
    // Execute parallel operations for performance
    const [byKeyResult, byFingerprintResult] = await Promise.all([
      this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { key }
        })
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "fingerprint-index",
          KeyConditionExpression: "fingerprint = :fp",
          ExpressionAttributeValues: {
            ":fp": fingerprint
          }
        })
      )
    ]);

    const byKey = this.parseRecord(byKeyResult.Item);
    const byFingerprint =
      byFingerprintResult.Items && byFingerprintResult.Items.length > 0
        ? this.parseRecord(byFingerprintResult.Items[0])
        : null;

    return { byKey, byFingerprint };
  }

  private parseRecord(item: any): IdempotencyRecord | null {
    if (!item) return null;

    // Filter expired records
    const now = Math.floor(Date.now() / 1000);
    if (item.expiresAt && item.expiresAt < now) {
      return null;
    }

    return {
      key: item.key,
      fingerprint: item.fingerprint,
      status: item.status,
      response: item.responseStatus
        ? {
            status: item.responseStatus,
            headers: item.responseHeaders || {},
            body: item.responseBody || ""
          }
        : undefined,
      expiresAt: item.expiresAt * 1000 // Convert seconds to milliseconds
    };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
    const expiresAt = Math.floor((Date.now() + ttlMs) / 1000);

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          key,
          fingerprint,
          status: "processing",
          expiresAt
        }
      })
    );
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { key },
          UpdateExpression:
            "SET #status = :status, responseStatus = :responseStatus, responseHeaders = :responseHeaders, responseBody = :responseBody",
          ConditionExpression: "attribute_exists(#key)",
          ExpressionAttributeNames: {
            "#key": "key",
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":status": "completed",
            ":responseStatus": response.status,
            ":responseHeaders": response.headers,
            ":responseBody": response.body
          }
        })
      );
    } catch (error: any) {
      if (error.name === "ConditionalCheckFailedException") {
        throw new Error(`Record not found for key: ${key}`);
      }
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // No-op: DynamoDB TTL handles cleanup
  }
}
