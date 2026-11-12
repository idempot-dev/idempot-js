# Spec Delta

## Purpose

Binds each stored idempotency record to the operation that produced it, so a key reused on
another route or by another principal cannot return a response that belongs to a different
request.

## ADDED Requirements

### Requirement: A key is scoped to the operation that used it

A stored record SHALL be bound to the operation that produced it: the HTTP method, the path and
query string as received, and, where the deployment identifies a principal, that principal. A
key sent with a different operation SHALL NOT return another operation's stored response.

#### Scenario: Same key on another route runs independently

- **GIVEN** a completed request to `POST /orders` with an idempotency key
- **WHEN** the same key and body arrive at `POST /orders/1/cancel`
- **THEN** the cancel handler runs and its own response is returned

#### Scenario: Same key for another principal runs independently

- **GIVEN** a completed request from one principal with an idempotency key
- **WHEN** a different principal sends the same key and body
- **THEN** the second request runs and does not receive the first principal's response

### Requirement: Conflict responses stay inside one operation

Within one operation the system SHALL answer 422 when a key returns with a different payload,
and 409 when a different key returns with the same payload. Neither answer SHALL be produced by
a record belonging to another operation.

#### Scenario: Same key with a different payload returns 422

- **GIVEN** a completed request to a route with an idempotency key
- **WHEN** the same key returns to that route with a different body
- **THEN** the response status is 422 and it names the key reuse

#### Scenario: Different key with the same payload returns 409

- **GIVEN** a completed request to a route with a key and a body
- **WHEN** a different key sends the same body to the same route
- **THEN** the response status is 409

#### Scenario: Matching payloads on different routes do not conflict

- **GIVEN** a completed request to a route with a key and a body
- **WHEN** a different key sends the same body to another route
- **THEN** the request executes and neither a 409 nor a 422 response is returned

#### Scenario: Body-less requests on different routes do not conflict

- **GIVEN** a completed request with no body to a route
- **WHEN** a different key sends a body-less request to another route
- **THEN** the request executes and neither a 409 nor a 422 response is returned

### Requirement: The operation is derived from the request as received

The operation SHALL be the method and the path and query the server received. Scheme, host and
port SHALL NOT form part of it. A different method, path or query string SHALL be a different
operation.

#### Scenario: A different host does not change the operation

- **GIVEN** a completed request carrying an idempotency key
- **WHEN** the same method, path, query and body are retried with a different Host header
- **THEN** the stored response is replayed

#### Scenario: A different query string is a different operation

- **GIVEN** a completed request to a path with a query string
- **WHEN** the same key and body arrive at the same path with a different query string
- **THEN** the handler runs and its own response is returned

#### Scenario: A different method is a different operation

- **GIVEN** a completed `POST` request to a path carrying an idempotency key
- **WHEN** a `PATCH` request carrying the same key arrives at the same path
- **THEN** the `PATCH` handler runs and its own response is returned

### Requirement: Principal scoping never fails a request

A deployment MAY supply the principal that owns the request. Where no principal is configured,
records SHALL be scoped by the operation alone. Where the configured principal is absent or
cannot be resolved, the request SHALL be processed under the operation-only identity rather than
refused.

#### Scenario: An unresolved principal falls back to the operation

- **GIVEN** a deployment that resolves a principal, and a request whose principal cannot be
  resolved
- **WHEN** that request carries an idempotency key
- **THEN** the request is processed under the operation-only identity and no error response is
  returned

### Requirement: Records written before scoping are honoured until they expire

A record stored before scoping existed carries no operation, and SHALL continue to answer a
retry of its key until its retention period ends, so that upgrading does not turn an in-flight
retry into a second execution.

#### Scenario: A pre-upgrade record still answers a retry

- **GIVEN** a record stored before scoping existed, whose retention period has not passed
- **WHEN** a retry arrives with the same key and body
- **THEN** the stored response is replayed rather than the handler running again

#### Scenario: An expired pre-upgrade record answers nothing

- **GIVEN** a record stored before scoping existed, whose retention period has passed
- **WHEN** a retry arrives with the same key and body
- **THEN** the handler runs and its own response is returned
