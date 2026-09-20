/**
 * A small pool of dedicated clients that keep the lookup statement
 * prepared server-side.
 *
 * Named prepared statements live in a single server session, so a
 * connection pool's rotating clients cannot share one: `pool.query` with a
 * statement name fails whenever the next call lands on a client that never
 * prepared it. Owning a few dedicated clients lets the hot lookup path
 * skip both statement planning (~0.05-0.27ms per statement on this
 * workload) and pool client acquisition on every call.
 *
 * @template C client object with connect(), query(config), end(), on()
 */

/**
 * @typedef {Object} PreparedLookupPoolOptions
 * @property {() => C} clientFactory - creates one fresh client per slot
 * @property {string} statementName - server-side prepared statement name
 * @property {string} statementText - SQL text of the statement
 * @property {number} size - number of dedicated clients to hold (0 keeps
 *   the pool empty; every query then reports fallback)
 */

export class PreparedLookupPool {
  /**
   * @type {Array<{client: C, ready: boolean}>}
   */
  #entries = [];

  /**
   * Round-robin cursor over the ready entries.
   * @type {number}
   */
  #cursor = 0;

  /**
   * @type {string}
   */
  #statementName;

  /**
   * @type {string}
   */
  #statementText;

  /**
   * @param {PreparedLookupPoolOptions} options
   */
  constructor({ clientFactory, statementName, statementText, size }) {
    this.#statementName = statementName;
    this.#statementText = statementText;
    for (let slot = 0; slot < size; slot += 1) {
      this.#spawn(clientFactory);
    }
  }

  /**
   * Connect one client asynchronously; it joins the rotation once ready.
   * A failed connect retires the slot silently - the store falls back to
   * its regular pool, so a lost dedicated client never degrades lookup
   * below the unprepared baseline.
   *
   * @param {() => C} clientFactory
   * @returns {void}
   */
  #spawn(clientFactory) {
    const client = /** @type {C} */ (clientFactory());
    const entry = { client, ready: false, inFlight: 0 };
    this.#entries.push(entry);
    client.on("error", () => {
      entry.ready = false;
      this.#retire(entry);
    });
    Promise.resolve(client.connect())
      .then(() => {
        entry.ready = true;
      })
      .catch(() => {
        this.#retire(entry);
      });
  }

  /**
   * @param {{client: C, ready: boolean}} entry
   * @returns {void}
   */
  #retire(entry) {
    this.#entries = this.#entries.filter((candidate) => candidate !== entry);
  }

  /**
   * Run the prepared statement on the next ready client.
   *
   * @param {any[]} values - statement parameters
   * @returns {Promise<{rows: any[]} | null>} the query result, or null
   *   when no client is ready (caller must fall back to its regular pool)
   */
  async query(values) {
    const entry = this.#nextReady();
    if (!entry) {
      return null;
    }
    entry.inFlight += 1;
    let result;
    try {
      result = await entry.client.query({
        name: this.#statementName,
        text: this.#statementText,
        values
      });
    } catch {
      // Connection-level failures retire the client; the caller falls
      // back to its regular pool, which surfaces the real error.
      result = null;
      entry.ready = false;
      this.#retire(entry);
      entry.client.end().catch(() => {});
    }
    entry.inFlight -= 1;
    return result;
  }

  /**
   * Prefer an idle client so concurrent queries never stack on one
   * connection (pg deprecates query() on an executing client); fall back
   * to the least busy ready client when all are busy.
   *
   * @returns {{client: C, ready: boolean, inFlight: number} | null}
   */
  #nextReady() {
    const ready = this.#entries.filter((entry) => entry.ready);
    if (ready.length === 0) {
      return null;
    }
    const idle = ready.filter((entry) => entry.inFlight === 0);
    if (idle.length > 0) {
      const entry = idle[this.#cursor % idle.length];
      this.#cursor = (this.#cursor + 1) % idle.length;
      return entry;
    }
    let least = ready[0];
    for (const entry of ready) {
      if (entry.inFlight < least.inFlight) {
        least = entry;
      }
    }
    return least;
  }

  /**
   * Close every dedicated client.
   * @returns {Promise<void>}
   */
  async end() {
    const entries = this.#entries;
    this.#entries = [];
    await Promise.allSettled(
      entries.map((entry) => /** @type {any} */ (entry.client).end())
    );
  }
}
