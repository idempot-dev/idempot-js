# BDD Spec Compliance Tests Design

## Status

Draft

## Overview

Replace integration tests with BDD-style Gherkin scenarios for spec compliance testing. The feature files serve as executable documentation and are portable across JavaScript, Go, and Python implementations.

## Goals

- Executable spec compliance documentation
- Cross-language portability (JS → Go → Python)
- Fine-grained scenario coverage of IETF spec requirements
- Self-evident step definitions for porting

## Approach

Use the Cucumber/Gherkin ecosystem:

- JavaScript: `@cucumber/cucumber`
- Go: `github.com/cucumber/godog`
- Python: `behave`

Each language implements identical step definitions using native HTTP clients and SQLite drivers.

## Directory Structure

```
tests/spec/
├── idempotency.feature    # All scenarios (~50)
├── steps/
│   ├── world.js           # Shared state & hooks
│   ├── http-steps.js      # HTTP request steps
│   ├── response-steps.js  # Response assertion steps
│   └── storage-steps.js   # DB verification steps
```

## Scenario Design

### Header Validation (~8 scenarios)

- Missing `Idempotency-Key` on POST → 400
- Key exceeding 256 characters → 400
- Invalid format (not a string) → 400
- Empty string key → 400

### First Request Handling (~10 scenarios)

- Creates idempotency record in DB
- Returns 200 status
- Stores response body in DB
- Stores response status in DB
- Creates expected resource (e.g., order)

### Duplicate Request Handling (~8 scenarios)

- Returns cached response
- Sets `Idempotent-Replayed: true` header
- Does not create duplicate DB records
- Does not duplicate resource creation

### Fingerprint Conflict (~6 scenarios)

- Same body, different key → 409 Conflict
- Response body contains conflict message
- Only one resource created

### Key Reuse Conflict (~4 scenarios)

- Same key, different body → 422 Unprocessable Content
- Response body contains error message

### Concurrent Requests (~6 scenarios)

- Duplicate request during processing → 409 Conflict
- Response body indicates "request outstanding"

### Error Response Format (~8 scenarios)

- 400 error body follows RFC 7807
- 409 error body follows RFC 7807
- 422 error body follows RFC 7807
- `Content-Type: application/problem+json`

### Edge Cases (~6 scenarios)

- GET requests (no idempotency required): should return 200, no idempotency record created
- PUT requests: should return 200, creates idempotency record
- DELETE requests: should return 200, creates idempotency record
- Empty request body: should return 200, creates idempotency record

## Step Definitions

### HTTP Steps

```gherkin
Given a POST endpoint at "/api"
Given a PUT endpoint at "/api"
Given a DELETE endpoint at "/api"
Given a GET endpoint at "/api"
Given an idempotency key "xxx"
Given an idempotency key of 257 characters
When I send a POST request to "/api" with body {...}
When I send a POST request to "/api" without an idempotency key
```

### Response Steps

```gherkin
Then the response status should be 400
Then the response body should contain {...}
Then the response should have header "Idempotent-Replayed" with value "true"
Then the response content-type should be "application/problem+json"
```

### Storage Steps

```gherkin
And an idempotency record should exist with key "xxx"
And the idempotency record status should be "complete"
And the idempotency record response body should be {...}
And N orders should exist in the database
```

## Cross-Language Portability

### Feature File Sharing

The canonical `idempotency.feature` file lives in this repository at `tests/spec/idempotency.feature`. When porting to Go or Python, copy this file verbatim into the corresponding project (e.g., `tests/spec/idempotency.feature` in idempot-go and idempot-py repositories).

### What copies verbatim

- `idempotency.feature` file

### What gets re-implemented

- Step definitions (using native HTTP clients and SQLite drivers)

### Language-specific dependencies

**JavaScript**

- `@cucumber/cucumber`
- `better-sqlite3`
- `express` or `fastify` (test server)

**Go**

- `github.com/cucumber/godog`
- `github.com/mattn/go-sqlite3`

**Python**

- `behave`
- `sqlite3` (stdlib)
- `flask` or `http.server` (test server)

## Implementation Notes

### Database Setup

- SQLite for all three languages
- Schema created before each scenario
- Schema dropped after each scenario
- Idempotency records table + orders table

### Test Server

- JavaScript: Express/Fastify with middleware
- Go: `net/http` with middleware
- Python: Flask with middleware

### State Management

- Each scenario gets fresh DB and server
- Step definitions use shared world object for state
- No dependencies between scenarios

## Validation Criteria

- All ~50 scenarios pass in JS
- Feature file is identical across all three languages
- Step definitions are self-evident (no spec knowledge required)
- Each spec requirement has corresponding scenarios
