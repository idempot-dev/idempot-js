# IETF Spec Compliance

The idempot-js library implements [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07), the IETF standard for the Idempotency-Key HTTP header.

This document details how the library complies with each requirement in the specification.

## Implemented Requirements

### MUST Requirements (Required)

| Requirement                          | Section | Implementation                                                            |
| ------------------------------------ | ------- | ------------------------------------------------------------------------- |
| Idempotency-Key as String            | 2.1     | ✅ Header value extracted as string                                       |
| Unique idempotency keys              | 2.2     | ✅ Key stored with request fingerprint to ensure uniqueness               |
| Identify idempotency key from header | 2.5.2   | ✅ Parses `Idempotency-Key` header (configurable via `headerName` option) |
| Generate idempotency fingerprint     | 2.5.2   | ✅ SHA-256 hash of method + path + body                                   |
| Enforce idempotency                  | 2.6     | ✅ Returns cached response for duplicate requests                         |

### SHOULD Requirements (Recommended)

| Requirement                                     | Section | Implementation                                                                 |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Use UUID or random identifier                   | 2.2     | ✅ Library doesn't generate keys (client responsibility), but validates format |
| Publish expiration policy                       | 2.3     | ✅ Configurable via `ttlMs` option                                             |
| Return 400 if key missing                       | 2.7     | ✅ Optional via `required: true` option                                        |
| Return 422 if key reused with different payload | 2.7     | ✅ Returns 422 with problem details when fingerprint mismatch detected         |
| Return 409 for concurrent requests              | 2.7     | ✅ Returns 409 Conflict when original request still processing                 |

### MAY Requirements (Optional)

| Requirement             | Section | Implementation                                                                    |
| ----------------------- | ------- | --------------------------------------------------------------------------------- |
| Idempotency fingerprint | 2.4     | ✅ SHA-256 hash of method + path + body (configurable via `hashAlgorithm` option) |
| Time-based expiry       | 2.3     | ✅ Configurable via `ttlMs` option, defaults to 24 hours                          |

## Error Responses

The library follows the spec's error handling recommendations:

| Scenario                                | Status Code | Response                                                    |
| --------------------------------------- | ----------- | ----------------------------------------------------------- |
| Missing Idempotency-Key (when required) | 400         | Problem Details JSON with link to documentation             |
| Key reused with different payload       | 422         | Problem Details JSON with "Idempotency-Key is already used" |
| Concurrent request (still processing)   | 409         | Problem Details JSON with "request is outstanding"          |

## What's Not Covered

The spec leaves some things to the application layer:

- **Key format**: The spec recommends UUIDs, but the library accepts any string value.
- **Store implementation**: The spec doesn't mandate storage implementation. We provide Redis, PostgreSQL, MySQL, SQLite, and Bun SQL stores.
- **Key generation**: The spec says clients should generate keys. We don't generate keys—clients provide them.

## Compliance Status

✅ **Full compliance** with draft-ietf-httpapi-idempotency-key-header-07

All MUST and SHOULD requirements are implemented. The library gives you the flexibility to choose which optional features to enable based on your API's needs.
