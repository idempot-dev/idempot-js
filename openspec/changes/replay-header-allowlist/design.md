# Design

## Context

- See `proposal.md` for motivation.
- Capture is inline in each adapter and dumps the framework's whole header map:
  `hono/index.js:247`, `express/index.js:276-282`, `fastify/index.js:271-277`,
  `bun/index.js:273-276`. Replay is `prepareCachedResponse` in
  `packages/core/src/validation.js`, which spreads the stored map and then sets
  `x-idempotent-replayed`, so the marker already wins over a stored value.
- The four adapters disagree on multi-value headers. `Headers.entries()` in Hono and
  `Headers.forEach` in Bun join repeats with `", "`. Express passes the Node array straight into
  the record, and `res.set` accepts an array, so several `Set-Cookie` values replay as several
  fields. Fastify coerces with `String(v)`, producing `"a,b"` with no space.
- The store record is `{status, headers: Record<string,string>, body}` in every backend. Backends
  persist the map as JSON; none inspect it.
- Every status is stored today, including 4xx and 5xx, which is what makes
  `WWW-Authenticate` a replayable header rather than a curiosity.

## Goals / Non-Goals

**Goals:**

- One predicate decides what leaves the process, applied on the way into the store and on the way
  out of it.
- The same stored shape from all four adapters, so a record written by one is replayable by
  another.
- A single place to extend for callers who need more than the default set.

**Non-Goals:**

- Changing the record schema, or the store adapter interfaces.
- Making the store lossless for binary bodies. `Content-Encoding` is excluded precisely because
  the stored body is decoded text; fixing that is a separate change.
- Re-litigating which statuses are stored.

## Decisions

### Explicit allowlist, default deny

An explicit list rather than a `Content-*` prefix rule or a deny-list. `Content-Length` and
`Content-Encoding` sit inside the prefix and must not be replayed, which kills the prefix idea,
and the current bug is what a deny-list produces when it starts empty.

### Filter at capture and at replay

Capture filtering is the security fix: a `Set-Cookie` must not reach Redis or a SQL table,
because a stored session secret is a defect even when nothing replays it. Replay filtering is
correctness during rollout: records written before this change, or by an instance still running
the old version, keep wide header maps for up to the record TTL, and a replay must not forward
them.

Alternatives considered: replay-only (leaves secrets at rest, fails the issue's premise);
capture-only (leaks from old records until TTL expiry, and from peer instances mid-deploy).

### The predicate lives in core

A single `selectReplayHeaders(headers, replayHeaders)` helper beside `prepareCachedResponse`, used
by `prepareCachedResponse` itself and exported for the adapters' capture paths. Four independent
implementations are how the adapters diverged in the first place. Adapters keep collecting their
framework-specific map and hand it over.

### Never-replay set is separate from the allowlist

`Set-Cookie` is absolute. So are hop-by-hop fields (`Connection`, `Keep-Alive`, `TE`, `Trailer`,
`Transfer-Encoding`, `Upgrade`, `Proxy-*`, plus any field named inside a stored `Connection`),
the framing fields `Content-Length` and `Content-Encoding`, and `Date`. Names in this set are
rejected from `replayHeaders` and removed on replay even when a stored record carries them.

Rationale per entry: `Set-Cookie` is a credential bound to another session; hop-by-hop fields
describe a connection that no longer exists; `Content-Length` and `Content-Encoding` describe
bytes the framework is about to write itself; `Date` describes the original message.

### Names are matched case-insensitively and stored lowercase

Node and Hono hand back lowercase names, Fastify and Express vary by version and by how the
handler set them. Matching lowercases both sides; the record stores lowercase names. Header names
are case-insensitive (RFC 9110 §5.1) and HTTP/2 requires lowercase, so nothing is lost.

### Repeats fold to one field with ", "

Capture folds repeated fields into one value joined by `", "`, which is the standard combine
rule (RFC 9110 §5.2) and what Hono and Bun already do. `Set-Cookie` is dropped before folding, so
the one header where folding is forbidden (RFC 6265 §3) never reaches the fold.

Consequence for `WWW-Authenticate`: several challenges are replayed on one field line. RFC 9110
§11.6.1 warns that form "might not be interoperable" with some clients, and that header fields of
this name may occur multiple times. Accepted, documented, and revisitable by widening the record
to `string | string[]`; that would touch six backends and four adapters, so it waits for a
reported failure.

### `replayHeaders` extends, never replaces

Default `[]`, additive, validated as an array of header names using the existing option-validation
style. Replace semantics would let a caller re-add a cookie, and every caller who wants fewer
headers can simply not name them.

### Capture points per adapter

| Adapter | Capture                              | Change                                                                       |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Hono    | `c.res.headers.entries()`            | pass through the selector                                                    |
| Express | `res.getHeaders()` at `finish`       | pass through the selector, which also removes the array/string inconsistency |
| Fastify | `reply.getHeaders()` in `reply.then` | pass through the selector                                                    |
| Bun     | `response.headers.forEach`           | pass through the selector                                                    |

### Tests

Cucumber scenarios under the `@library` `Rule`, as listed in the spec delta. The ones needing new
step definitions: stored-record header assertions (`getIdempotencyRecords()` already exposes
`responseStatus` and `responseBody`, so `responseHeaders` is reachable), a replayed-response header
assertion, and seeding a record directly for the pre-change-record scenario. Unit tests per adapter
cover the capture filter, and core tests cover the selector's case handling, folding and
never-replay set.

## Risks / Trade-offs

- **Breaking change** → major release, `replayHeaders` as the escape hatch, and a changelog entry
  naming the narrowing explicitly. The cucumber scenarios are the migration contract.
- **Existing records are wide until they expire** → replay-side filtering covers them; no data
  migration needed, and the store payload shrinks on its own as records roll over.
- **Some app-set security headers stop appearing on replays** (CSP, HSTS) → they are policy, not
  representation. If an app sets them only inside handlers rather than in middleware,
  `replayHeaders` is the answer. Stated in the docs rather than guessed at in code.
- **Multi-challenge 401s may not parse on every client** → documented limitation, with the record
  shape change as the escape route if it is reported.
- **Decoded-text store limits** → `Content-Encoding` stays excluded, so a handler that sends
  pre-encoded bytes is not replayed faithfully. Pre-existing, now documented.
- **Ordering with `spec-classification`** → the new scenarios land in the `@library` Rule from
  that change. If both are in flight, this one rebases onto it; the scenarios can be authored
  untagged-then-tagged, but not merged that way, because the completeness check requires a class.

## Migration Plan

1. Core selector and option, with the four adapters switched over in the same change so no
   combination ships half-filtered.
2. Docs: configuration table, exclusion classes, and a note in each framework page.
3. Release as a major version; no store migration; old records self-heal through replay
   filtering.
4. Rollback is a revert of the library package: records written by the new version contain fewer
   headers, which an older version replays without complaint.
