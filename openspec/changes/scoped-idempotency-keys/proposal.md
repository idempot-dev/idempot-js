# Proposal

## Why

A stored record is identified by the client's raw `Idempotency-Key` alone. Two requests that
the draft treats as unrelated therefore collide: a key reused on another route replays that
route's response instead of running the handler (#260), and two clients that pick the same key
receive each other's response (#264). The guide already promises the opposite, that the method
is part of the fingerprint and that endpoints are isolated, so the gap is between documented
and actual behaviour rather than a missing preference. Every open issue in this release
changes the same replay path, so the record identity is settled first and the rest build on it.

## What Changes

- **BREAKING** A record is identified by the route (method, path and query) plus an optional
  caller-supplied principal, not by the raw key alone.
- **BREAKING** A key reused on another route becomes an independent operation, instead of a 422
  or a replay of the other route's stored response.
- A `scope` option lets an adapter supply the principal part. The route is always included and
  needs no configuration.
- The fingerprint index is scoped, so a lookup cannot return another scope's record. This also
  removes the false cross-route 409 for identical bodies, and the worse case where every
  empty-body POST in a deployment shares one fingerprint.
- The 422 detail returns to meaning what it says: same key, same route, different payload.
- Pre-upgrade records keep answering retries for their remaining TTL, so deploying does not
  turn in-flight retries into duplicate executions.
- Header replay allowlisting (#261), `Retry-After` on the in-flight 409 (#262) and lock TTL
  decoupling (#263) follow in this release on top of the scoped identity.

## Capabilities

### New Capabilities

- `record-identity`: how a stored record is identified and compared. Route and principal
  scoping, fingerprint scope, the conflict statuses that follow from it, and the compatibility
  rules for records written by an earlier version.

### Modified Capabilities

None. `spec-verification` covers the suite's class discipline, which does not change.

## Impact

- Core: the identity helper, the fingerprint composition, and the fallback that honours
  pre-upgrade records for their remaining TTL.
- The four framework adapters supply the route, and the principal when `scope` is configured.
- Stores: none change, and the store interface is untouched. Third-party implementations,
  including the store under development outside this repository, keep working unchanged.
- MySQL-family deployments widen one column: keys of 239 characters or more need a documented
  `ALTER TABLE` before upgrading, because the scope token is prepended to the client key.
- New cucumber scenarios in the `@library` fingerprint Rule. The feature file is generated from
  `idempot-dev/website`, so the scenarios are authored there and synced with `pnpm spec:sync`.
- Documentation: `docs/guide/shared-middleware.md` currently states behaviour the library does
  not have; `docs/guide/configuration.md` gains `scope`.
- Release: major, shipped through `next-major` together with #261, #262 and #263.
