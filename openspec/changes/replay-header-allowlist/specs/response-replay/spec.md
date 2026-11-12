# Spec Delta

## Purpose

Defines which parts of a stored response are replayed when a duplicate request arrives, so a
replay carries the representation the original request produced and nothing that belongs to the
original request, its client, or its connection. Draft-ietf-httpapi-idempotency-key-header-07
does not specify response headers, so every requirement here is library policy.

## ADDED Requirements

### Requirement: Only representation metadata is replayed by default

A replay SHALL send only headers that describe the stored representation: `Content-Type`,
`Content-Language`, `Content-Location`, `Content-Disposition`, `Location`, `ETag`,
`Last-Modified` and `WWW-Authenticate`. Any other header set by the handler SHALL be omitted
unless the caller adds it through `replayHeaders`.

#### Scenario: A created resource keeps its location and validator

- **GIVEN** a handler that responds 201 with a `Location` header and an `ETag`
- **WHEN** a duplicate request replays the stored response
- **THEN** the replay carries the same `Location` and `ETag` values

#### Scenario: A negotiated media type survives replay

- **GIVEN** a handler that responds with a JSON body and `Content-Type: application/json`
- **WHEN** the response is replayed
- **THEN** the replayed response carries the same `Content-Type` and a client parses it as JSON

#### Scenario: A custom header is not replayed

- **GIVEN** a handler that sets `X-Cost-Centre`
- **WHEN** the response is replayed
- **THEN** the replayed response has no `X-Cost-Centre` header

### Requirement: Cookies are never replayed

A replayed response SHALL NOT contain `Set-Cookie`, whatever the stored record holds and
whatever the caller configures. This holds for every framework adapter and every status code.

#### Scenario: A handler cookie is not replayed

- **GIVEN** a handler that sets a session cookie
- **WHEN** a duplicate request replays the stored response
- **THEN** the replay carries no `Set-Cookie` header

#### Scenario: Naming Set-Cookie in replayHeaders changes nothing

- **GIVEN** middleware configured with `replayHeaders: ["Set-Cookie"]`
- **WHEN** a response with a session cookie is replayed
- **THEN** the replay carries no `Set-Cookie` header

### Requirement: Request-scoped headers are not stored

The stored record SHALL contain only the headers that are eligible for replay. Cookies,
CORS headers, telemetry identifiers, rate-limit values, cache directives and connection
metadata SHALL NOT be persisted, so a stored record cannot leak them to a later reader.

#### Scenario: Stored record omits the cookie

- **GIVEN** a handler that sets a session cookie
- **WHEN** the response is stored
- **THEN** the stored record contains no `Set-Cookie` header

#### Scenario: Stored record omits origin-bound headers

- **GIVEN** a handler that sets `Access-Control-Allow-Origin` for the original request
- **WHEN** the response is stored
- **THEN** the stored record contains no CORS header

### Requirement: Records written before the change cannot leak

Replay SHALL apply the same selection to headers that were stored before the selection existed,
so a record written by an earlier version, or by an instance still running it, is replayed
safely.

#### Scenario: Pre-change record with a cookie

- **GIVEN** a stored record whose header map contains `Set-Cookie` and a hop-by-hop header
- **WHEN** that record is replayed
- **THEN** the replay carries neither header

### Requirement: Message framing is regenerated, not replayed

A replay SHALL NOT send a stored `Content-Length`, `Content-Encoding`, `Transfer-Encoding`,
`Connection`, `Date` or any other hop-by-hop header. The replaying framework SHALL generate
framing and message metadata for the message it actually writes.

#### Scenario: Content length describes the replayed body

- **GIVEN** a stored record whose `Content-Length` was recorded for a different encoding
- **WHEN** the response is replayed
- **THEN** the response's `Content-Length` matches the length of the body that was written

#### Scenario: Hop-by-hop headers are dropped

- **GIVEN** a stored record containing `Connection`, `Keep-Alive` and `Transfer-Encoding`
- **WHEN** the response is replayed
- **THEN** the replay carries none of them

### Requirement: Stored error responses keep their authentication challenge

Because error responses are stored and replayed, a replayed 401 SHALL carry the stored
`WWW-Authenticate` value, folded into one field line when the original response carried
several challenges.

#### Scenario: A replayed unauthorized response keeps its challenge

- **GIVEN** a handler that responds 401 with `WWW-Authenticate: Bearer realm="api"`
- **WHEN** a duplicate request replays the stored response
- **THEN** the replay carries the same `WWW-Authenticate` value

#### Scenario: Several challenges fold into one field

- **GIVEN** a response carrying two `WWW-Authenticate` challenges
- **WHEN** the response is stored and replayed
- **THEN** the replay carries one `WWW-Authenticate` field line whose value is the two
  challenges joined by a comma and a space

### Requirement: Callers extend the default set

The `replayHeaders` option SHALL add caller-named headers to the default allowlist without
removing any default header. Names SHALL be matched case-insensitively. Headers that are never
replayable SHALL remain excluded even when named.

#### Scenario: A configured header is replayed

- **GIVEN** middleware configured with `replayHeaders: ["X-Request-Cost"]`
- **WHEN** a response carrying `X-Request-Cost` is replayed
- **THEN** the replay carries that header and every default allowlist header still applies

#### Scenario: Header names match regardless of case

- **GIVEN** middleware configured with `replayHeaders: ["x-request-cost"]` where the handler set
  `X-Request-Cost`
- **WHEN** the response is replayed
- **THEN** the replay carries the header

### Requirement: The replay marker cannot be overridden

`x-idempotent-replayed: true` SHALL be set on every replay and SHALL NOT take a value from the
stored record.

#### Scenario: Stored marker value is ignored

- **GIVEN** a stored record whose header map contains `x-idempotent-replayed: false`
- **WHEN** the response is replayed
- **THEN** the replay carries `x-idempotent-replayed: true`
