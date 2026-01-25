# Idempotency Middleware Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build IETF-compliant idempotency middleware for Hono that prevents duplicate processing of POST/PATCH requests.

**Architecture:** Interface-driven design with pluggable stores. In-memory store with dual indexes (by key and fingerprint). xxHash fingerprinting with JSONPath exclusions. TDD throughout with 100% coverage target.

**Tech Stack:** Hono 4.x, TypeScript, tap (testing), xxhash-wasm, jsonpath-plus

---

## Phase 1: Project Setup and Testing Infrastructure

### Task 1: Install Testing Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install tap testing framework**

Run: `npm install --save-dev tap @types/tap`

Expected: Dependencies added to devDependencies

**Step 2: Add test scripts to package.json**

Update scripts section:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "tap",
    "test:coverage": "tap --coverage-report=html",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "check": "npm run format:check && npm run lint"
  }
}
```

**Step 3: Create tap configuration**

Create `.taprc` in project root:

```yaml
files:
  - "tests/**/*.test.ts"
coverage: true
check-coverage: true
```

**Step 4: Verify test setup**

Run: `npm test`

Expected: "No test files found" message (no tests exist yet)

**Step 5: Commit**

```bash
git add package.json package-lock.json .taprc
git commit -m "chore: add tap testing framework and configuration"
```

---

### Task 2: Install Runtime Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install xxhash-wasm**

Run: `npm install xxhash-wasm`

Expected: Dependency added

**Step 2: Install jsonpath-plus**

Run: `npm install jsonpath-plus`

Expected: Dependency added

**Step 3: Install types**

Run: `npm install --save-dev @types/jsonpath-plus`

Expected: Type definitions added

**Step 4: Set Hono as peer dependency**

Update package.json:

```json
{
  "peerDependencies": {
    "hono": ">=4.0.0"
  }
}
```

**Step 5: Verify installations**

Run: `npm list xxhash-wasm jsonpath-plus`

Expected: Shows installed versions

**Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install idempotency middleware dependencies"
```

---

### Task 3: Create Project Structure

**Files:**
- Create: `src/types.ts`
- Create: `src/store/interface.ts`
- Create: `src/store/index.ts`
- Create: `tests/.gitkeep`

**Step 1: Create store directory**

Run: `mkdir -p src/store`

**Step 2: Create tests directory**

Run: `mkdir -p tests`

**Step 3: Create types file with interfaces**

Create `src/types.ts`:

```typescript
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
```

**Step 4: Create store index exports**

Create `src/store/index.ts`:

```typescript
export * from "./interface";
```

**Step 5: Create interface file**

Create `src/store/interface.ts`:

```typescript
export type { IdempotencyStore, IdempotencyRecord } from "../types";
```

**Step 6: Add .gitkeep to tests**

Run: `touch tests/.gitkeep`

**Step 7: Verify TypeScript compiles**

Run: `npm run build`

Expected: Compiles without errors

**Step 8: Commit**

```bash
git add src/types.ts src/store/ tests/.gitkeep
git commit -m "feat: add idempotency store interface and types"
```

---

## Phase 2: Store Implementation (TDD)

### Task 4: Test - Store Initialization

**Files:**
- Create: `tests/store.test.ts`
- Create: `src/store/memory.ts`

**Step 1: Write failing test for store initialization**

Create `tests/store.test.ts`:

```typescript
import { test } from "tap";
import { MemoryIdempotencyStore } from "../src/store/memory";

test("MemoryIdempotencyStore - initialization", async (t) => {
  const store = new MemoryIdempotencyStore();
  t.ok(store, "store should be created");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module '../src/store/memory'"

**Step 3: Create minimal memory store class**

Create `src/store/memory.ts`:

```typescript
import type { IdempotencyStore, IdempotencyRecord } from "../types";

export class MemoryIdempotencyStore implements IdempotencyStore {
  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    throw new Error("Not implemented");
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async cleanup(): Promise<void> {
    throw new Error("Not implemented");
  }
}
```

**Step 4: Update store index to export memory store**

Update `src/store/index.ts`:

```typescript
export * from "./interface";
export { MemoryIdempotencyStore } from "./memory";
```

**Step 5: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 1 test passing

**Step 6: Commit**

```bash
git add tests/store.test.ts src/store/memory.ts src/store/index.ts
git commit -m "test: add store initialization test"
```

---

### Task 5: Test - Store Lookup (Empty State)

**Files:**
- Modify: `tests/store.test.ts`
- Modify: `src/store/memory.ts`

**Step 1: Write failing test for empty lookup**

Add to `tests/store.test.ts`:

```typescript
test("MemoryIdempotencyStore - lookup with empty store", async (t) => {
  const store = new MemoryIdempotencyStore();
  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Not implemented" error

**Step 3: Implement lookup with dual-index storage**

Update `src/store/memory.ts`:

```typescript
import type { IdempotencyStore, IdempotencyRecord } from "../types";

export class MemoryIdempotencyStore implements IdempotencyStore {
  private byKey = new Map<string, IdempotencyRecord>();
  private byFingerprint = new Map<string, IdempotencyRecord>();

  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    return {
      byKey: this.byKey.get(key) ?? null,
      byFingerprint: this.byFingerprint.get(fingerprint) ?? null
    };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async cleanup(): Promise<void> {
    throw new Error("Not implemented");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add tests/store.test.ts src/store/memory.ts
git commit -m "feat: implement store lookup with dual indexes"
```

---

### Task 6: Test - Store Start Processing

**Files:**
- Modify: `tests/store.test.ts`
- Modify: `src/store/memory.ts`

**Step 1: Write failing test for startProcessing**

Add to `tests/store.test.ts`:

```typescript
test("MemoryIdempotencyStore - startProcessing creates record", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key = "test-key";
  const fingerprint = "test-fp";
  const ttlMs = 1000;

  await store.startProcessing(key, fingerprint, ttlMs);

  const result = await store.lookup(key, fingerprint);
  t.ok(result.byKey, "record should exist by key");
  t.ok(result.byFingerprint, "record should exist by fingerprint");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.key, key, "key should match");
  t.equal(result.byKey?.fingerprint, fingerprint, "fingerprint should match");
  t.ok(result.byKey?.expiresAt > Date.now(), "should have future expiration");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Not implemented" error

**Step 3: Implement startProcessing**

Update `src/store/memory.ts`:

```typescript
async startProcessing(
  key: string,
  fingerprint: string,
  ttlMs: number
): Promise<void> {
  const record: IdempotencyRecord = {
    key,
    fingerprint,
    status: "processing",
    expiresAt: Date.now() + ttlMs
  };

  this.byKey.set(key, record);
  this.byFingerprint.set(fingerprint, record);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 3 tests passing

**Step 5: Commit**

```bash
git add tests/store.test.ts src/store/memory.ts
git commit -m "feat: implement store startProcessing"
```

---

### Task 7: Test - Store Complete

**Files:**
- Modify: `tests/store.test.ts`
- Modify: `src/store/memory.ts`

**Step 1: Write failing test for complete**

Add to `tests/store.test.ts`:

```typescript
test("MemoryIdempotencyStore - complete updates record", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key = "test-key";
  const fingerprint = "test-fp";

  await store.startProcessing(key, fingerprint, 1000);

  const response = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ success: true })
  };

  await store.complete(key, response);

  const result = await store.lookup(key, fingerprint);
  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.same(result.byKey?.response, response, "response should be stored");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Not implemented" error

**Step 3: Implement complete**

Update `src/store/memory.ts`:

```typescript
async complete(
  key: string,
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  }
): Promise<void> {
  const record = this.byKey.get(key);
  if (!record) {
    throw new Error(`No record found for key: ${key}`);
  }

  record.status = "complete";
  record.response = response;

  // Update both indexes
  this.byKey.set(key, record);
  this.byFingerprint.set(record.fingerprint, record);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 4 tests passing

**Step 5: Commit**

```bash
git add tests/store.test.ts src/store/memory.ts
git commit -m "feat: implement store complete"
```

---

### Task 8: Test - Store Cleanup (Expired Records)

**Files:**
- Modify: `tests/store.test.ts`
- Modify: `src/store/memory.ts`

**Step 1: Write failing test for cleanup**

Add to `tests/store.test.ts`:

```typescript
test("MemoryIdempotencyStore - cleanup removes expired records", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key1 = "expired-key";
  const key2 = "valid-key";
  const fp1 = "fp1";
  const fp2 = "fp2";

  // Create expired record (TTL = -1000ms, already expired)
  await store.startProcessing(key1, fp1, -1000);

  // Create valid record
  await store.startProcessing(key2, fp2, 10000);

  await store.cleanup();

  const result1 = await store.lookup(key1, fp1);
  const result2 = await store.lookup(key2, fp2);

  t.equal(result1.byKey, null, "expired record should be removed by key");
  t.equal(result1.byFingerprint, null, "expired record should be removed by fingerprint");
  t.ok(result2.byKey, "valid record should remain");
  t.ok(result2.byFingerprint, "valid record should remain");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Not implemented" error

**Step 3: Implement cleanup**

Update `src/store/memory.ts`:

```typescript
async cleanup(): Promise<void> {
  const now = Date.now();

  // Find expired keys
  const expiredKeys: string[] = [];
  for (const [key, record] of this.byKey) {
    if (record.expiresAt <= now) {
      expiredKeys.push(key);
    }
  }

  // Remove from both indexes
  for (const key of expiredKeys) {
    const record = this.byKey.get(key);
    if (record) {
      this.byKey.delete(key);
      this.byFingerprint.delete(record.fingerprint);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 5 tests passing

**Step 5: Commit**

```bash
git add tests/store.test.ts src/store/memory.ts
git commit -m "feat: implement store cleanup for expired records"
```

---

### Task 9: Test - Store Coverage Check

**Files:**
- Modify: `tests/store.test.ts`

**Step 1: Add edge case tests**

Add to `tests/store.test.ts`:

```typescript
test("MemoryIdempotencyStore - complete throws on missing key", async (t) => {
  const store = new MemoryIdempotencyStore();

  await t.rejects(
    store.complete("nonexistent-key", {
      status: 200,
      headers: {},
      body: ""
    }),
    { message: /No record found/ },
    "should throw error for missing key"
  );
});

test("MemoryIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const store = new MemoryIdempotencyStore();

  await store.startProcessing("key1", "fp1", 1000);

  const result = await store.lookup("key2", "fp1");
  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");
});
```

**Step 2: Run tests to verify all pass**

Run: `npm test`

Expected: PASS - 7 tests passing

**Step 3: Check coverage**

Run: `npm run test:coverage`

Expected: 100% coverage on src/store/memory.ts

**Step 4: Commit**

```bash
git add tests/store.test.ts
git commit -m "test: add store edge cases for complete coverage"
```

---

## Phase 3: Fingerprinting Logic (TDD)

### Task 10: Test - Basic Fingerprinting Setup

**Files:**
- Create: `tests/fingerprint.test.ts`
- Create: `src/fingerprint.ts`

**Step 1: Write failing test for basic fingerprinting**

Create `tests/fingerprint.test.ts`:

```typescript
import { test } from "tap";
import { generateFingerprint } from "../src/fingerprint";

test("generateFingerprint - identical JSON produces identical hash", async (t) => {
  const body1 = JSON.stringify({ foo: "bar", baz: 123 });
  const body2 = JSON.stringify({ baz: 123, foo: "bar" });

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);

  t.equal(fp1, fp2, "fingerprints should match for equivalent JSON");
  t.ok(fp1.length > 0, "fingerprint should be non-empty");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module '../src/fingerprint'"

**Step 3: Create fingerprint module with xxHash**

Create `src/fingerprint.ts`:

```typescript
import { xxh3 } from "xxhash-wasm";

let xxhashInstance: Awaited<ReturnType<typeof xxh3>> | null = null;

async function getXXHash() {
  if (!xxhashInstance) {
    xxhashInstance = await xxh3();
  }
  return xxhashInstance;
}

export async function generateFingerprint(
  body: string,
  excludeFields: string[]
): Promise<string> {
  const xxhash = await getXXHash();

  // Try to parse as JSON
  let normalized: string;
  try {
    const parsed = JSON.parse(body);
    // Normalize: sort keys
    normalized = JSON.stringify(sortKeys(parsed));
  } catch {
    // Not JSON, use as-is
    normalized = body;
  }

  return xxhash(normalized).toString();
}

function sortKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 8 tests passing (including new fingerprint test)

**Step 5: Commit**

```bash
git add tests/fingerprint.test.ts src/fingerprint.ts
git commit -m "feat: implement basic fingerprinting with xxHash"
```

---

### Task 11: Test - Fingerprint Field Exclusion (Root Level)

**Files:**
- Modify: `tests/fingerprint.test.ts`
- Modify: `src/fingerprint.ts`

**Step 1: Write failing test for root field exclusion**

Add to `tests/fingerprint.test.ts`:

```typescript
test("generateFingerprint - excludes root-level fields", async (t) => {
  const body1 = JSON.stringify({ foo: "bar", timestamp: "2024-01-01", baz: 123 });
  const body2 = JSON.stringify({ foo: "bar", timestamp: "2024-01-02", baz: 123 });

  const fp1 = await generateFingerprint(body1, ["timestamp"]);
  const fp2 = await generateFingerprint(body2, ["timestamp"]);

  t.equal(fp1, fp2, "fingerprints should match when excluded field differs");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - fingerprints don't match because timestamp not excluded yet

**Step 3: Implement field exclusion for root level**

Update `src/fingerprint.ts`:

```typescript
export async function generateFingerprint(
  body: string,
  excludeFields: string[]
): Promise<string> {
  const xxhash = await getXXHash();

  let normalized: string;
  try {
    let parsed = JSON.parse(body);

    // Exclude root-level fields
    const rootExclusions = excludeFields.filter(f => !f.startsWith("$."));
    for (const field of rootExclusions) {
      delete parsed[field];
    }

    // Normalize: sort keys
    normalized = JSON.stringify(sortKeys(parsed));
  } catch {
    // Not JSON, use as-is
    normalized = body;
  }

  return xxhash(normalized).toString();
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 9 tests passing

**Step 5: Commit**

```bash
git add tests/fingerprint.test.ts src/fingerprint.ts
git commit -m "feat: implement root-level field exclusion in fingerprinting"
```

---

### Task 12: Test - Fingerprint JSONPath Exclusion

**Files:**
- Modify: `tests/fingerprint.test.ts`
- Modify: `src/fingerprint.ts`

**Step 1: Write failing test for JSONPath exclusion**

Add to `tests/fingerprint.test.ts`:

```typescript
test("generateFingerprint - excludes nested fields via JSONPath", async (t) => {
  const body1 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "req-1", clientId: "client-a" }
  });
  const body2 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "req-2", clientId: "client-a" }
  });

  const fp1 = await generateFingerprint(body1, ["$.metadata.requestId"]);
  const fp2 = await generateFingerprint(body2, ["$.metadata.requestId"]);

  t.equal(fp1, fp2, "fingerprints should match when nested field excluded");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - fingerprints don't match because JSONPath not implemented

**Step 3: Implement JSONPath exclusion**

Update `src/fingerprint.ts`:

```typescript
import { xxh3 } from "xxhash-wasm";
import { JSONPath } from "jsonpath-plus";

// ... getXXHash function stays the same ...

export async function generateFingerprint(
  body: string,
  excludeFields: string[]
): Promise<string> {
  const xxhash = await getXXHash();

  let normalized: string;
  try {
    let parsed = JSON.parse(body);

    // Exclude root-level fields
    const rootExclusions = excludeFields.filter(f => !f.startsWith("$."));
    for (const field of rootExclusions) {
      delete parsed[field];
    }

    // Exclude nested fields via JSONPath
    const jsonPathExclusions = excludeFields.filter(f => f.startsWith("$."));
    for (const path of jsonPathExclusions) {
      try {
        JSONPath({
          path,
          json: parsed,
          callback: (value, type, payload) => {
            if (payload.parent && payload.parentProperty) {
              delete payload.parent[payload.parentProperty];
            }
          }
        });
      } catch {
        // Ignore invalid JSONPath
      }
    }

    // Normalize: sort keys
    normalized = JSON.stringify(sortKeys(parsed));
  } catch {
    // Not JSON, use as-is
    normalized = body;
  }

  return xxhash(normalized).toString();
}

// ... sortKeys function stays the same ...
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 10 tests passing

**Step 5: Commit**

```bash
git add tests/fingerprint.test.ts src/fingerprint.ts
git commit -m "feat: implement JSONPath field exclusion in fingerprinting"
```

---

### Task 13: Test - Fingerprint Edge Cases

**Files:**
- Modify: `tests/fingerprint.test.ts`

**Step 1: Add edge case tests**

Add to `tests/fingerprint.test.ts`:

```typescript
test("generateFingerprint - handles non-JSON bodies", async (t) => {
  const body1 = "plain text body";
  const body2 = "plain text body";
  const body3 = "different text";

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);
  const fp3 = await generateFingerprint(body3, []);

  t.equal(fp1, fp2, "identical plain text should have same fingerprint");
  t.not(fp1, fp3, "different plain text should have different fingerprint");
});

test("generateFingerprint - handles empty body", async (t) => {
  const fp1 = await generateFingerprint("", []);
  const fp2 = await generateFingerprint("{}", []);

  t.ok(fp1, "should handle empty string");
  t.ok(fp2, "should handle empty JSON");
  t.not(fp1, fp2, "empty string and empty JSON should differ");
});

test("generateFingerprint - handles arrays", async (t) => {
  const body1 = JSON.stringify({ items: [1, 2, 3] });
  const body2 = JSON.stringify({ items: [1, 2, 3] });

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);

  t.equal(fp1, fp2, "arrays should be handled correctly");
});
```

**Step 2: Run tests to verify all pass**

Run: `npm test`

Expected: PASS - 13 tests passing

**Step 3: Check coverage**

Run: `npm run test:coverage`

Expected: 100% coverage on src/fingerprint.ts

**Step 4: Commit**

```bash
git add tests/fingerprint.test.ts
git commit -m "test: add fingerprint edge cases for complete coverage"
```

---

## Phase 4: Middleware Implementation (TDD)

### Task 14: Test - Middleware Passes Through Non-Protected Methods

**Files:**
- Create: `tests/middleware.test.ts`
- Create: `src/middleware.ts`

**Step 1: Write failing test for GET passthrough**

Create `tests/middleware.test.ts`:

```typescript
import { test } from "tap";
import { Hono } from "hono";
import { idempotency } from "../src/middleware";

test("middleware - passes through GET requests", async (t) => {
  const app = new Hono();

  app.get("/test", idempotency(), (c) => {
    return c.json({ message: "success" });
  });

  const res = await app.request("/test");

  t.equal(res.status, 200, "should return 200");
  const json = await res.json();
  t.same(json, { message: "success" }, "should return handler response");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module '../src/middleware'"

**Step 3: Create minimal middleware that passes through**

Create `src/middleware.ts`:

```typescript
import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types";

export function idempotency(
  options: IdempotencyOptions = {}
): MiddlewareHandler {
  return async (c, next) => {
    // Pass through for now
    await next();
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 14 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: create idempotency middleware skeleton"
```

---

### Task 15: Test - Middleware With Optional Header (Missing)

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write test for POST without idempotency key (optional)**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - POST without key when optional", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should allow request without key");
});
```

**Step 2: Run test to verify it passes already**

Run: `npm test`

Expected: PASS - middleware already passes through

**Step 3: No implementation needed (already works)**

**Step 4: Commit**

```bash
git add tests/middleware.test.ts
git commit -m "test: verify POST without idempotency key works when optional"
```

---

### Task 16: Test - Middleware With Required Header (Missing)

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing test for required header**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - POST without key when required", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency({ required: true }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400");
  const json = await res.json();
  t.match(json.error, /required/i, "should indicate header is required");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - returns 200 instead of 400

**Step 3: Implement header requirement check**

Update `src/middleware.ts`:

```typescript
import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types";

const DEFAULT_OPTIONS: Required<IdempotencyOptions> = {
  required: false,
  ttlMs: 86400000, // 24 hours
  excludeFields: [],
  store: null as any, // Will be set to MemoryIdempotencyStore
  headerName: "idempotency-key",
  maxKeyLength: 255
};

export function idempotency(
  options: IdempotencyOptions = {}
): MiddlewareHandler {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    const method = c.req.method;

    // Only intercept POST and PATCH
    if (method !== "POST" && method !== "PATCH") {
      await next();
      return;
    }

    const key = c.req.header(opts.headerName);

    // Check if header is required
    if (opts.required && !key) {
      return c.json(
        { error: "Idempotency-Key header is required" },
        400
      );
    }

    // If no key and optional, pass through
    if (!key) {
      await next();
      return;
    }

    // TODO: Implement idempotency logic
    await next();
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 16 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement required header validation"
```

---

### Task 17: Test - Middleware Key Validation

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing tests for key validation**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - validates key length", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
    return c.json({ message: "created" });
  });

  const longKey = "x".repeat(256);
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": longKey },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400 for too-long key");
  const json = await res.json();
  t.match(json.error, /255 characters/i, "should indicate max length");
});

test("middleware - validates empty key", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400 for empty key");
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL - validation not implemented

**Step 3: Implement key validation**

Update `src/middleware.ts`, add after the key extraction:

```typescript
// If no key and optional, pass through
if (!key) {
  await next();
  return;
}

// Validate key
if (key.length === 0 || key.length > opts.maxKeyLength) {
  return c.json(
    { error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters` },
    400
  );
}

// TODO: Implement idempotency logic
await next();
```

**Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: PASS - 18 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement idempotency key validation"
```

---

### Task 18: Test - Middleware First Request (New Key)

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`
- Modify: `src/store/index.ts`

**Step 1: Write failing test for first request**

Add to `tests/middleware.test.ts`:

```typescript
import { MemoryIdempotencyStore } from "../src/store/memory";

test("middleware - first request with new key", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created", id: 123 });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "unique-key-1" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should return handler response");
  const json = await res.json();
  t.same(json, { message: "created", id: 123 }, "should return correct body");
  t.notOk(res.headers.get("x-idempotent-replayed"), "should not be replayed");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - store integration not implemented

**Step 3: Import dependencies and implement store integration**

Update `src/middleware.ts`:

```typescript
import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types";
import { MemoryIdempotencyStore } from "./store/memory";
import { generateFingerprint } from "./fingerprint";

const DEFAULT_OPTIONS: Required<Omit<IdempotencyOptions, "store">> & {
  store: null;
} = {
  required: false,
  ttlMs: 86400000,
  excludeFields: [],
  store: null,
  headerName: "idempotency-key",
  maxKeyLength: 255
};

export function idempotency(
  options: IdempotencyOptions = {}
): MiddlewareHandler {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const store = opts.store ?? new MemoryIdempotencyStore();

  return async (c, next) => {
    const method = c.req.method;

    // Only intercept POST and PATCH
    if (method !== "POST" && method !== "PATCH") {
      await next();
      return;
    }

    const key = c.req.header(opts.headerName);

    // Check if header is required
    if (opts.required && !key) {
      return c.json(
        { error: "Idempotency-Key header is required" },
        400
      );
    }

    // If no key and optional, pass through
    if (!key) {
      await next();
      return;
    }

    // Validate key
    if (key.length === 0 || key.length > opts.maxKeyLength) {
      return c.json(
        { error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters` },
        400
      );
    }

    // Read body and generate fingerprint
    const body = await c.req.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    // Lookup in store
    const lookup = await store.lookup(key, fingerprint);

    // No existing record - process new request
    if (!lookup.byKey && !lookup.byFingerprint) {
      await store.startProcessing(key, fingerprint, opts.ttlMs);

      // Call handler
      await next();

      // Cache response
      const response = {
        status: c.res.status,
        headers: Object.fromEntries(c.res.headers.entries()),
        body: await c.res.text()
      };

      await store.complete(key, response);

      // Reconstruct response (Hono response was consumed)
      return c.body(response.body, response.status, response.headers);
    }

    // TODO: Handle existing records
    await next();
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 19 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement first request processing with store"
```

---

### Task 19: Test - Middleware Cached Response Replay

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing test for response replay**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - replays cached response", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  let callCount = 0;
  app.post("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "created", id: 123 });
  });

  // First request
  const res1 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res1.status, 200, "first request should succeed");
  t.equal(callCount, 1, "handler should be called once");

  // Second request with same key and body
  const res2 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res2.status, 200, "cached response should have same status");
  t.equal(callCount, 1, "handler should not be called again");
  t.equal(
    res2.headers.get("x-idempotent-replayed"),
    "true",
    "should have replay header"
  );

  const json2 = await res2.json();
  t.same(json2, { message: "created", id: 123 }, "should return cached body");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - replay logic not implemented

**Step 3: Implement response replay**

Update `src/middleware.ts`, replace the `// TODO: Handle existing records` section:

```typescript
// Existing complete record - replay
if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
  const cached = lookup.byKey.response;
  return c.body(
    cached.body,
    cached.status,
    {
      ...cached.headers,
      "x-idempotent-replayed": "true"
    }
  );
}

// TODO: Handle other conflict cases
await next();
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 20 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement cached response replay"
```

---

### Task 20: Test - Middleware Concurrent Request Detection

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing test for concurrent detection**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - detects concurrent processing", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), async (c) => {
    // Simulate slow handler
    await new Promise((resolve) => setTimeout(resolve, 100));
    return c.json({ message: "created" });
  });

  // Start two requests concurrently
  const promise1 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key" },
    body: JSON.stringify({ data: "test" })
  });

  const promise2 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key" },
    body: JSON.stringify({ data: "test" })
  });

  const [res1, res2] = await Promise.all([promise1, promise2]);

  // One should succeed, one should get 409
  const statuses = [res1.status, res2.status].sort();
  t.same(statuses, [200, 409], "one success and one conflict");

  const conflict = res1.status === 409 ? res1 : res2;
  const json = await conflict.json();
  t.match(json.error, /already being processed/i, "should indicate concurrent processing");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - concurrent detection not implemented

**Step 3: Implement concurrent request detection**

Update `src/middleware.ts`, add after the lookup:

```typescript
// Existing record being processed - reject concurrent request
if (lookup.byKey?.status === "processing") {
  return c.json(
    { error: "A request with this idempotency key is already being processed" },
    409
  );
}

// Existing complete record - replay
if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
  const cached = lookup.byKey.response;
  return c.body(
    cached.body,
    cached.status,
    {
      ...cached.headers,
      "x-idempotent-replayed": "true"
    }
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 21 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement concurrent request detection"
```

---

### Task 21: Test - Middleware Payload Mismatch Detection

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing test for payload mismatch**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - detects same key with different payload", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key" },
    body: JSON.stringify({ data: "original" })
  });

  // Second request with same key, different body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key" },
    body: JSON.stringify({ data: "changed" })
  });

  t.equal(res.status, 422, "should return 422");
  const json = await res.json();
  t.match(json.error, /different.*payload/i, "should indicate payload mismatch");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - payload mismatch detection not implemented

**Step 3: Implement payload mismatch detection**

Update `src/middleware.ts`, add before the "No existing record" section:

```typescript
// Same key, different fingerprint - payload mismatch
if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
  return c.json(
    { error: "Idempotency key reused with different request payload" },
    422
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 22 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement payload mismatch detection"
```

---

### Task 22: Test - Middleware Duplicate With Different Key

**Files:**
- Modify: `tests/middleware.test.ts`
- Modify: `src/middleware.ts`

**Step 1: Write failing test for duplicate detection**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - detects duplicate request with different key", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-1" },
    body: JSON.stringify({ data: "test" })
  });

  // Second request with different key, same body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-2" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 409, "should return 409");
  const json = await res.json();
  t.match(json.error, /different.*key/i, "should indicate different key");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL - duplicate key detection not implemented

**Step 3: Implement duplicate with different key detection**

Update `src/middleware.ts`, add before the payload mismatch check:

```typescript
// Same fingerprint, different key - duplicate operation
if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
  return c.json(
    { error: "This request was already processed with a different idempotency key" },
    409
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS - 23 tests passing

**Step 5: Commit**

```bash
git add tests/middleware.test.ts src/middleware.ts
git commit -m "feat: implement duplicate operation detection"
```

---

### Task 23: Test - Middleware Coverage and Edge Cases

**Files:**
- Modify: `tests/middleware.test.ts`

**Step 1: Add remaining edge case tests**

Add to `tests/middleware.test.ts`:

```typescript
test("middleware - PATCH method is protected", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  let callCount = 0;
  app.patch("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "updated" });
  });

  await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key" },
    body: JSON.stringify({ data: "test" })
  });

  const res = await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should replay cached response");
  t.equal(callCount, 1, "handler called only once");
});

test("middleware - custom header name", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency({ headerName: "x-request-id" }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "x-request-id": "custom-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should work with custom header name");
});

test("middleware - field exclusion works", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  let callCount = 0;
  app.post(
    "/test",
    idempotency({ store, excludeFields: ["timestamp"] }),
    (c) => {
      callCount++;
      return c.json({ message: "created" });
    }
  );

  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "exclude-key" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-01" })
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "exclude-key" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-02" })
  });

  t.equal(res.status, 200, "should replay despite timestamp difference");
  t.equal(callCount, 1, "handler called only once");
});
```

**Step 2: Run tests to verify all pass**

Run: `npm test`

Expected: PASS - 26 tests passing

**Step 3: Check coverage**

Run: `npm run test:coverage`

Expected: Near 100% coverage on middleware.ts

**Step 4: Commit**

```bash
git add tests/middleware.test.ts
git commit -m "test: add middleware edge cases for complete coverage"
```

---

## Phase 5: Public API and Package Configuration

### Task 24: Create Public API Exports

**Files:**
- Create: `src/index.ts`

**Step 1: Create main export file**

Create `src/index.ts`:

```typescript
// Main middleware factory
export { idempotency } from "./middleware";

// Types for custom store implementations
export type {
  IdempotencyStore,
  IdempotencyRecord,
  IdempotencyOptions
} from "./types";

// Built-in store
export { MemoryIdempotencyStore } from "./store";
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Successful build with all exports

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add public API exports"
```

---

### Task 25: Update Package Configuration

**Files:**
- Modify: `package.json`

**Step 1: Update package.json metadata**

Update package.json:

```json
{
  "name": "hono-idempotency",
  "version": "0.1.0",
  "description": "Idempotency middleware for Hono implementing IETF draft-ietf-httpapi-idempotency-key-header",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "exports": {
    ".": "./dist/index.js"
  },
  "keywords": ["hono", "middleware", "idempotency", "http"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/mroderick/hono-idempotency"
  }
}
```

**Step 2: Verify package configuration**

Run: `npm run build && ls dist/`

Expected: dist contains compiled files

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: update package configuration for publication"
```

---

### Task 26: Create Basic Example

**Files:**
- Create: `examples/basic-app.ts`

**Step 1: Create examples directory**

Run: `mkdir -p examples`

**Step 2: Create basic example**

Create `examples/basic-app.ts`:

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../src";

const app = new Hono();

// Optional idempotency (default)
app.post("/payments", idempotency(), (c) => {
  return c.json({
    id: Math.random().toString(36).substring(7),
    amount: 100,
    status: "completed"
  });
});

// Required idempotency
app.post("/transfers", idempotency({ required: true }), (c) => {
  return c.json({
    id: Math.random().toString(36).substring(7),
    status: "pending"
  });
});

// With field exclusions
app.post(
  "/orders",
  idempotency({
    excludeFields: ["timestamp", "$.metadata.requestId"]
  }),
  (c) => {
    return c.json({
      orderId: Math.random().toString(36).substring(7),
      status: "created"
    });
  }
);

serve({
  fetch: app.fetch,
  port: 3000
});

console.log("Server running on http://localhost:3000");
console.log("Try:");
console.log('  curl -X POST http://localhost:3000/payments \\');
console.log('    -H "Idempotency-Key: unique-key-1" \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"amount": 100}\'');
```

**Step 3: Test example runs**

Run: `tsx examples/basic-app.ts`

Expected: Server starts without errors (then Ctrl+C)

**Step 4: Commit**

```bash
git add examples/basic-app.ts
git commit -m "docs: add basic usage example"
```

---

## Phase 6: Final Verification

### Task 27: Run Complete Test Suite

**Files:**
- None (verification only)

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests passing

**Step 2: Check coverage**

Run: `npm run test:coverage`

Expected: 100% or near-100% coverage

**Step 3: Verify linting**

Run: `npm run lint`

Expected: No linting errors

**Step 4: Verify formatting**

Run: `npm run format:check`

Expected: All files properly formatted

**Step 5: Run full check**

Run: `npm run check`

Expected: All checks pass

**Step 6: Verify build**

Run: `npm run build && ls -la dist/`

Expected: Complete build with types

**Step 7: Document results**

If any coverage gaps, document them as intentional or add tests.

---

## Completion Checklist

- [ ] Phase 1: Testing infrastructure and project setup
- [ ] Phase 2: Store implementation with 100% coverage
- [ ] Phase 3: Fingerprinting with JSONPath support and 100% coverage
- [ ] Phase 4: Middleware with all conflict detection
- [ ] Phase 5: Public API and package configuration
- [ ] Phase 6: All tests passing, coverage target met
- [ ] Example application created and verified
- [ ] All code formatted and linted
- [ ] Build produces complete package

---

## Notes

- Follow TDD strictly: test first, implement to pass, refactor if needed
- Commit after each passing test
- Run coverage checks at phase boundaries
- Target 100% coverage, document any exceptions
- Keep commits small and focused
- Each task should take 5-15 minutes
