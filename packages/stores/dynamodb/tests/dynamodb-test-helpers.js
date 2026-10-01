import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

/**
 * In-memory fake of the four DynamoDB commands the store uses, backed by a
 * plain Map of unmarshalled items keyed by the `key` attribute.
 *
 * The fake evaluates exactly the expressions the store sends — and nothing
 * else. Any unknown expression is a loud failure, so a store edit that
 * changes command shape fails unit tests instead of silently passing on a
 * fake that no longer matches the real service contract.
 *
 * Condition semantics reproduced:
 *   PutItem  "attribute_not_exists(#k) OR #t < :now"
 *   Query    "fingerprint = :fp"
 *   Update   "SET #s = :s, #r = :r"
 */
const PUT_CONDITION = "attribute_not_exists(#k) OR #t < :now";
const QUERY_CONDITION = "fingerprint = :fp";
const UPDATE_EXPRESSION = "SET #s = :s, #r = :r";
const UPDATE_CONDITION = "attribute_exists(#k)";

/**
 * @param {string} actual
 * @param {string} expected
 * @returns {void}
 */
function assertExpression(actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `fake client does not implement expression: ${actual}` +
        ` (expected: ${expected})`
    );
  }
}

/**
 * Creates a fake DynamoDBClient for unit testing.
 * @returns {object} Fake client with sinon-free fakes and a __store inspectable Map
 */
export function createFakeDynamoDBClient() {
  /** @type {Map<string, Record<string, any>>} */
  const store = new Map();

  /**
   * @param {Error} err
   * @returns {Error}
   */
  function conditionalCheckFailed(err) {
    err.name = "ConditionalCheckFailedException";
    err.$metadata = { attempts: 1 };
    return err;
  }

  return {
    __store: store,
    config: { region: "us-east-1" },

    /**
     * Optional injected error thrown by PutItem operations.
     * @type {Error | null}
     */
    __putError: null,

    /**
     * Optional injected error thrown by UpdateItem operations.
     * @type {Error | null}
     */
    __updateError: null,

    /**
     * Set to true by destroy() so tests can assert teardown.
     * @type {boolean}
     */
    __destroyed: false,

    /**
     * @param {{ input: any }} command
     * @returns {Promise<any>}
     */
    async send(command) {
      const input = command.input;

      if (input.Key && input.UpdateExpression !== undefined) {
        // UpdateItemCommand
        if (this.__updateError) {
          throw this.__updateError;
        }
        assertExpression(input.UpdateExpression, UPDATE_EXPRESSION);
        assertExpression(input.ConditionExpression, UPDATE_CONDITION);
        const item = store.get(unmarshall(input.Key).key);
        if (!item) {
          throw conditionalCheckFailed(
            new Error("The conditional request failed")
          );
        }
        const values = unmarshall(input.ExpressionAttributeValues);
        item.status = values[":s"];
        item.response = values[":r"];
        return {};
      }

      if (input.Key) {
        // GetItemCommand — no expiry filtering here: the store filters
        // client-side (GetItem cannot filter server-side), and that filter
        // branch must stay exercised.
        const item = store.get(unmarshall(input.Key).key);
        if (!item) {
          return {};
        }
        return { Item: marshall(structuredClone(item)) };
      }

      if (input.Item) {
        // PutItemCommand
        if (this.__putError) {
          throw this.__putError;
        }
        assertExpression(input.ConditionExpression, PUT_CONDITION);
        const values = unmarshall(input.ExpressionAttributeValues);
        const now = values[":now"];
        const item = unmarshall(input.Item);
        const existing = store.get(item.key);
        const claimable = !existing || existing.ttlEpoch < now;
        if (!claimable) {
          throw conditionalCheckFailed(
            new Error("The conditional request failed")
          );
        }
        store.set(item.key, structuredClone(item));
        return {};
      }

      if (input.IndexName) {
        // QueryCommand on the fingerprint GSI
        assertExpression(input.KeyConditionExpression, QUERY_CONDITION);
        const fingerprint = unmarshall(input.ExpressionAttributeValues)[":fp"];
        const matches = [...store.values()].filter(
          (item) => item.fingerprint === fingerprint
        );
        return {
          Items: matches
            .slice(0, input.Limit)
            .map((item) => marshall(structuredClone(item)))
        };
      }

      throw new Error(
        `fake client does not implement command: ${command.constructor?.name}`
      );
    },

    destroy() {
      this.__destroyed = true;
    }
  };
}
