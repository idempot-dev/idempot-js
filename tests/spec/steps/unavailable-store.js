/**
 * Mock store that simulates being unavailable
 */
export class UnavailableIdempotencyStore {
  async close() {
    // No-op
  }

  async lookup() {
    throw new Error("Store unavailable: connection refused");
  }

  async startProcessing() {
    throw new Error("Store unavailable: connection refused");
  }

  async complete() {
    throw new Error("Store unavailable: connection refused");
  }
}
