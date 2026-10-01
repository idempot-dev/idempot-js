/**
 * @typedef {import("@aws-sdk/client-dynamodb").DynamoDBClient} DynamoDBClient
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { IdempotencyKeyExistsError } from "@idempot/core";

/**
 * @typedef {Object} DynamoDbIdempotencyStoreOptions
 * @property {DynamoDBClient} client - The caller-owned DynamoDBClient instance
 * @property {string} [tableName] - DynamoDB table name (default: "idempotency")
 */

/**
 * Storage backend backed by a DynamoDB table with a primary key on `key` and
 * a global secondary index named `fingerprint-index` on `fingerprint`.
 *
 * The table needs both key attributes declared as STRING and the index
 * projecting all attributes; see the README for the CreateTable command.
 *
 * Expiry uses an epoch-seconds attribute named `ttlEpoch`, suitable for
 * DynamoDB's per-item TTL: records whose TTL has passed are treated as
 * absent by lookups and their keys are reclaimable by a new claim.
 *
 * @implements {IdempotencyStore}
 */
export class DynamoDbIdempotencyStore {
  /**
   * @type {DynamoDBClient}
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
    this.tableName = options.tableName ?? "idempotency";
  }

  /**
   * @param {Record<string, unknown>} item
   * @returns {IdempotencyRecord}
   */
  #toRecord(item) {
    return {
      key: /** @type {string} */ (item.key),
      fingerprint: /** @type {string} */ (item.fingerprint),
      status: /** @type {"processing" | "complete"} */ (item.status),
      ...(item.response
        ? { response: JSON.parse(/** @type {string} */ (item.response)) }
        : {}),
      expiresAt: /** @type {number} */ (item.expiresAt)
    };
  }

  /**
   * @param {IdempotencyRecord | null} record
   * @returns {IdempotencyRecord | null}
   */
  #dropExpired(record) {
    if (record && record.expiresAt <= Date.now()) {
      return null;
    }
    return record;
  }

  /**
   * Look up an idempotency record by key and fingerprint
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    const [byKeyRes, byFpRes] = await Promise.all([
      this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ key })
        })
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "fingerprint-index",
          KeyConditionExpression: "fingerprint = :fp",
          ExpressionAttributeValues: marshall({ ":fp": fingerprint }),
          Limit: 1
        })
      )
    ]);

    const byKeyItem = byKeyRes.Item ? unmarshall(byKeyRes.Item) : null;
    const byKey = this.#dropExpired(
      byKeyItem ? this.#toRecord(byKeyItem) : null
    );
    const fpItem = byFpRes.Items?.[0];
    const byFingerprint = this.#dropExpired(
      fpItem ? this.#toRecord(unmarshall(fpItem)) : null
    );

    return { byKey, byFingerprint };
  }

  /**
   * Start processing a request by atomically claiming the key. Only the
   * first concurrent claim wins; losers receive IdempotencyKeyExistsError,
   * which the middleware routes to a 409 conflict. An expired processing
   * record's key is reclaimable.
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    const expiresAt = Date.now() + ttlMs;
    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall({
            key,
            fingerprint,
            status: "processing",
            // DynamoDB TTL expects epoch seconds
            ttlEpoch: Math.floor(expiresAt / 1000),
            expiresAt
          }),
          ConditionExpression: "attribute_not_exists(#k) OR #t < :now",
          ExpressionAttributeNames: { "#k": "key", "#t": "ttlEpoch" },
          ExpressionAttributeValues: marshall({
            ":now": Math.floor(Date.now() / 1000)
          })
        })
      );
    } catch (err) {
      if (
        /** @type {{name?: string}} */ (err).name ===
        "ConditionalCheckFailedException"
      ) {
        throw new IdempotencyKeyExistsError(
          `Idempotency key ${key} is already being processed`
        );
      }
      throw err;
    }
  }

  /**
   * Complete a request by storing its response. The existence condition keeps
   * the response from silently upserting a record for an expired or missing
   * claim.
   * @param {string} key - The request key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ key }),
          UpdateExpression: "SET #s = :s, #r = :r",
          ConditionExpression: "attribute_exists(#k)",
          ExpressionAttributeNames: {
            "#k": "key",
            "#s": "status",
            "#r": "response"
          },
          ExpressionAttributeValues: marshall({
            ":s": "complete",
            ":r": JSON.stringify(response)
          })
        })
      );
    } catch (err) {
      if (
        /** @type {{name?: string}} */ (err).name ===
        "ConditionalCheckFailedException"
      ) {
        throw new Error(`No record found for key ${key}`);
      }
      throw err;
    }
  }

  /**
   * Destroy the injected client
   * @returns {Promise<void>}
   */
  async close() {
    this.client.destroy();
  }
}
