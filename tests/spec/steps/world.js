import { setWorldConstructor, After, Before } from "@cucumber/cucumber";
import { SqliteIdempotencyStore } from "../../../packages/stores/sqlite/index.js";

class IdempotencyWorld {
  constructor() {
    this.server = null;
    this.port = null;
    this.idempotencyKey = null;
    this.longKey = null;
    this.previousRequest = null;
    this.lastResponse = null;
    this.lastResponseIndex = null;
    this.responseIndex = 0;
    this.responseDelay = 0;
    this.store = null;
  }

  async startServer(handler = null) {
    const store = this.store;
    const express = (await import("express")).default;
    const { idempotency } =
      await import("../../../packages/frameworks/express/index.js");

    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(idempotency({ store }));

    expressApp.all("/api", async (req, res) => {
      if (this.responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
      }

      let body = "";
      if (
        req.headers["content-type"]?.includes("application/json") &&
        req.body
      ) {
        body = JSON.stringify(req.body);
      }

      const parsedBody = body ? JSON.parse(body) : {};

      if (handler) {
        await handler(req, res, parsedBody);
        return;
      }

      const key = req.headers["idempotency-key"];
      if (key) {
        store.db.prepare("INSERT INTO orders (data) VALUES (?)").run(body);
      }
      res.json({ success: true, body: parsedBody });
    });

    return new Promise((resolve) => {
      this.server = expressApp.listen(0, () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  async stopServer() {
    if (this.server) {
      const server = this.server;
      this.server = null;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }

  initDatabase() {
    // Store uses SQLite internally
    // Create orders table for test tracking
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  closeStore() {
    if (this.store) {
      this.store.close();
      this.store = null;
    }
  }

  getOrderCount() {
    if (!this.store?.db) return 0;
    const result = this.store.db
      .prepare("SELECT COUNT(*) as count FROM orders")
      .get();
    return result.count;
  }

  getIdempotencyRecordCount() {
    if (!this.store?.db) return 0;
    const result = this.store.db
      .prepare("SELECT COUNT(*) as count FROM idempotency_records")
      .get();
    return result.count;
  }

  getIdempotencyRecords() {
    if (!this.store?.db) return [];
    return this.store.db
      .prepare("SELECT * FROM idempotency_records")
      .all()
      .map((row) => ({
        key: row.key,
        fingerprint: row.fingerprint,
        status: row.status,
        responseStatus: row.response_status,
        responseHeaders: row.response_headers,
        responseBody: row.response_body
      }));
  }

  async sendRequest(path, method = "POST", body = null, idempotencyKey = null) {
    const headers = {
      "Content-Type": "application/json"
    };

    if (idempotencyKey !== null && idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const options = {
      method,
      headers
    };

    if (body !== null && method !== "GET" && method !== "DELETE") {
      options.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(
      `http://localhost:${this.port}${path}`,
      options
    );

    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    const responseHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      responseHeaders[key] = value;
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    };
  }
}

setWorldConstructor(IdempotencyWorld);

Before(function () {
  this.store = new SqliteIdempotencyStore({ path: ":memory:" });
  this.initDatabase();
});

After(async function () {
  await this.stopServer();
  this.closeStore();
});
