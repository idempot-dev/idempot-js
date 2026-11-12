# Proposal

## Why

Every framework adapter stores the outbound response header map wholesale and replays all of it
(issue #261). A replay therefore resends `Set-Cookie` to whoever sends the key next, along with
CORS headers describing the original `Origin`, stale rate-limit values, hop-by-hop headers, and
a `Content-Length` and `Date` that describe a different message. With keys unscoped (#264) the
`Set-Cookie` case is a session handover. The same headers also land in Redis, PostgreSQL, MySQL
and SQLite, so a live session secret is persisted for the record's TTL even when nobody replays
it.

Draft-ietf-httpapi-idempotency-key-header-07 says nothing about response headers, so the fix is
library policy and must be labelled as such in the spec suite (see the `spec-classification`
change).

## What Changes

- **BREAKING**: replay only an allowlist of representation headers by default:
  `Content-Type`, `Content-Language`, `Content-Location`, `Content-Disposition`, `Location`,
  `ETag`, `Last-Modified`, `WWW-Authenticate`. Anyone relying on a custom header surviving a
  replay must opt in.
- **BREAKING**: `Set-Cookie` is never replayed and never stored, even when named in the new
  `replayHeaders` option.
- Add a `replayHeaders` option that extends the allowlist with caller-named headers.
- Filter on capture, so blocked headers never reach the store, and again on replay, so records
  written by a pre-fix version or by an older node during a rolling deploy cannot leak them.
- Keep the existing `x-idempotent-replayed: true` behaviour, and make it unable to be overridden
  by a stored header.
- Document the exclusion classes and the reasons in `docs/guide/configuration.md`.

## Capabilities

### New Capabilities

- `response-replay`: which stored response data is replayed, which headers are replayed or
  dropped, and how a caller extends the default set.

### Modified Capabilities

None. No existing capability spec covers replay.

## Impact

- `packages/core/src/default-options.js` and one shared header-selection helper
- The four adapters: `packages/frameworks/{hono,express,fastify,bun}/index.js`
- `docs/guide/configuration.md` and the framework pages that list response behaviour
- New cucumber scenarios under the library-policy `Rule` from `spec-classification`
- Store payloads shrink; no store schema change. Existing records keep their wide header maps
  until they expire, which is why replay-side filtering is part of the change.
- Major-version release: the default replay set narrows.
