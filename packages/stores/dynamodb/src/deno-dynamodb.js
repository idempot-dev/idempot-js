// @ts-nocheck - Deno runtime only
/** @typedef {import("./interface.js").IdempotencyStore} IdempotencyStore */
/** @typedef {import("./interface.js").IdempotencyRecord} IdempotencyRecord */

/**
 * @typedef {Object} DenoDynamoDbIdempotencyStoreOptions
 * @property {string} [tableName] - DynamoDB table name (default: "idempotency")
 * @property {string} [region] - AWS region
 * @property {string} [endpoint] - DynamoDB endpoint (for local development)
 * @property {boolean} [testMode] - Use in-memory store instead of DynamoDB
 */

/**
 * @implements {IdempotencyStore}
 */
export class DenoDynamoDbIdempotencyStore {
  /** @type {any} */
  docClient = null;
  /** @type {string} */
  tableName;
  /** @type {boolean} */
  testMode;

  /** @type {Map<string, IdempotencyRecord>} */
  #testStore = new Map();

  /**
   * @param {DenoDynamoDbIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.tableName = options.tableName ?? "idempotency";
    this.testMode = options.testMode ?? false;
  }

  close() {
    // No-op for DynamoDB
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    if (this.testMode) {
      return {
        byKey: this.#testStore.get(key) ?? null,
        byFingerprint: this.#testStore.get(fingerprint) ?? null
      };
    }
    
    await this.init();
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, GetCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const client = new DynamoDBClient({
      region: "us-east-1"
    });
    const docClient = DynamoDBDocumentClient.from(client);
    
    const [byKeyResult, byFingerprintResult] = await Promise.all([
      docClient.send(new GetCommand({ TableName: this.tableName, Key: { key } })),
      docClient.send(new GetCommand({ TableName: this.tableName, Key: { key: fingerprint } }))
    ]);

    return {
      byKey: byKeyResult.Item ?? null,
      byFingerprint: byFingerprintResult.Item ?? null
    };
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    if (this.testMode) {
      const record = {
        key,
        fingerprint,
        status: "processing",
        expiresAt: Date.now() + ttlMs
      };
      this.#testStore.set(key, record);
      this.#testStore.set(fingerprint, record);
      return;
    }
    
    await this.init();
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, PutCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const client = new DynamoDBClient({
      region: "us-east-1"
    });
    const docClient = DynamoDBDocumentClient.from(client);
    
    await docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        key,
        fingerprint,
        status: "processing",
        expiresAt: Date.now() + ttlMs
      }
    }));
  }

  /**
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    if (this.testMode) {
      const existing = this.#testStore.get(key);
      if (!existing) {
        throw new Error(`No record found for key: ${key}`);
      }
      const record = {
        ...existing,
        status: "complete",
        response
      };
      this.#testStore.set(key, record);
      return;
    }
    
    await this.init();
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const client = new DynamoDBClient({
      region: "us-east-1"
    });
    const docClient = DynamoDBDocumentClient.from(client);
    
    await docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { key },
      UpdateExpression: "SET #status = :status, response = :response",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "complete",
        ":response": {
          status: response.status,
          headers: response.headers,
          body: response.body
        }
      }
    }));
  }

  async cleanup() {
    // Handled by DynamoDB TTL
  }

  /**
   * @returns {Promise<void>}
   */
  async init() {
    // DynamoDB client is initialized lazily on each operation
  }
}
