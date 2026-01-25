export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  status: "processing" | "complete";
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  expiresAt: number;
}

export interface IdempotencyOptions {
  required?: boolean;
  ttlMs?: number;
  excludeFields?: string[];
  store?: IdempotencyStore;
  headerName?: string;
  maxKeyLength?: number;
}

export interface IdempotencyStore {
  lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }>;

  startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void>;

  complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void>;

  cleanup(): Promise<void>;
}
