/**
 * A small pool of dedicated clients that keep the store's statements
 * prepared server-side.
 *
 * Named prepared statements live in a single server session, so a
 * connection pool's rotating clients cannot share one: `pool.query` with a
 * statement name fails whenever the next call lands on a client that never
 * prepared it. Owning a few dedicated clients lets every store statement
 * skip statement planning and pool client acquisition on every call.
 *
 * @template C client object with connect(), query(config), end(), on()
 */

/**
 * @typedef {Object} PreparedStatementPoolOptions
 * @property {() => C} clientFactory - creates one fresh client per slot
 * @property {string} statementName - server-side prepared statement name
 * @property {string} statementText - SQL text of the statement
 * @property {number} size - number of dedicated clients to hold (0 keeps
 *   the pool empty; every query then reports fallback)
 */

export class PreparedStatementPool {
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
   * @param {PreparedStatementPoolOptions} options
   */
  constructor({ clientFactory, size }) {
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
   * Run a named statement on the next ready client. pg prepares the
   * statement lazily on its first use per client.
   *
   * @param {{name: string, text: string, values: any[]}} statement
   * @returns {Promise<{rows: any[], rowCount?: number} | null>} the query
   *   result, or null when no client is ready or the client failed (caller
   *   must fall back to its regular pool)
   * @throws {Error} rethrows server-class statement errors (pg rejections
   *   carrying a five-character SQLSTATE in error.code) without retiring
   *   the client, so the caller sees the real error
   */
  async query(statement) {
    const entry = this.#nextReady();
    if (!entry) {
      return null;
    }
    entry.inFlight += 1;
    let result;
    try {
      result = await entry.client.query(statement);
    } catch (error) {
      entry.inFlight -= 1;
      // pg rejects server-class errors with a five-character SQLSTATE in
      // error.code (e.g. the INSERT's 23505) and leaves the client
      // healthy: rethrow without retiring, so duplicate-key contention
      // never shrinks the pool and the caller never re-executes the
      // statement on the fallback path.
      if (
        error &&
        typeof error.code === "string" &&
        /^[0-9A-Z]{5}$/.test(error.code)
      ) {
        throw error;
      }
      // Connection-level failures retire the client; the caller falls
      // back to its regular pool, which surfaces the real error.
      entry.ready = false;
      this.#retire(entry);
      entry.client.end().catch(() => {});
      return null;
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
