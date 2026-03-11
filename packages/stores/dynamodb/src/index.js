import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

/** @typedef {import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient} DynamoDBDocumentClient */

/**
 * @typedef {Object} IdempotencyRecord
 * @property {string} key
 * @property {string} fingerprint
 * @property {"processing" | "complete"} status
 * @property {{status: number, headers: Record<string, string>, body: string}} [response]
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} IdempotencyStore
 * @property {(key: string, fingerprint: string) => Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>} lookup
 * @property {(key: string, fingerprint: string, ttlMs: number) => Promise<void>} startProcessing
 * @property {(key: string, response: {status: number, headers: Record<string, string>, body: string}) => Promise<void>} complete
 * @property {() => Promise<void>} cleanup
 */

/**
 * @typedef {Object} DynamoDbIdempotencyStoreOptions
 * @property {DynamoDBDocumentClient} client - The DynamoDB document client
 * @property {string} [tableName] - The table name (defaults to "idempotency-records")
 */

/**
 * @implements {IdempotencyStore}
 */
export class DynamoDbIdempotencyStore {
  /**
   * @type {DynamoDBDocumentClient}
   */
  client;

  /**
   * @type {string}
   */
  tableName;

  /**
   * @param {DynamoDbIdempotencyStoreOptions} options
   */
  constructor(options) {
    this.client = options.client;
    this.tableName = options.tableName ?? "idempotency-records";
  }

  /**
   * Look up an idempotency record by key and fingerprint
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
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

  /**
   * Parse a DynamoDB item into an IdempotencyRecord
   * @private
   * @param {any} item - The DynamoDB item to parse
   * @returns {IdempotencyRecord | null}
   */
  parseRecord(item) {
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

  /**
   * Start processing a request
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
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

  /**
   * Mark a request as complete with its response
   * @param {string} key - The request key
   * @param {{status: number, headers: Record<string, string>, body: string}} response - The response object
   * @returns {Promise<void>}
   * @throws {Error} If Record not found for key
   */
  async complete(key, response) {
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
            ":status": "complete",
            ":responseStatus": response.status,
            ":responseHeaders": response.headers,
            ":responseBody": response.body
          }
        })
      );
    } catch (error) {
      if (
        /** @type {any} */ (error).name === "ConditionalCheckFailedException"
      ) {
        throw new Error(`Record not found for key: ${key}`);
      }
      throw error;
    }
  }

  /**
   * Clean up expired records (no-op: DynamoDB TTL handles cleanup)
   * @returns {Promise<void>}
   */
  async cleanup() {
    // No-op: DynamoDB TTL handles cleanup
  }
}
