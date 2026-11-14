# Design

## Context

See `proposal.md` for motivation. What shapes the approach:

The record identity is used in two places, and today both take the client's raw key alone:

```text
  lookup(key, fingerprint)  ->  { byKey, byFingerprint }
  startProcessing(key, fingerprint, ttlMs)
  complete(key, response)

  SQL:      WHERE (key = $2 AND expires_at > $1) OR (fingerprint = $3 AND expires_at > $1)
  Redis:    GET idempotency:<key>          GET fingerprint:<fingerprint>
```

`byKey` answers "is this the same operation?" and `byFingerprint` answers "has this payload
already been processed under a different key?", which the library answers with a 409. The
fingerprint is `h64` over the body with root and JSONPath exclusions applied, key-sorted.

Relevant constraints, all verified in this repository:

- **No migration machinery.** Every store runs `CREATE TABLE IF NOT EXISTS` once and nothing
  else. No `ALTER TABLE`, no schema version, no backfill anywhere in `packages/stores/`.
- **Two stores cap the key at 255 characters.** MySQL and Bun-SQL's MySQL mode declare
  `` `key` VARCHAR(255) PRIMARY KEY``. `maxKeyLength` defaults to 255.
- **Redis namespaces fingerprints globally.** `fingerprint:<hash>` is not per-scope, so scoping
  the key alone would still let a lookup return another scope's record.
- **The store interface is public.** It is a documented extension point, users implement it,
  and another store is in development outside this repository.
- **The draft does not settle route identity.** Section 2.2 forbids reusing a key with a
  different payload; section 2.4 generates the fingerprint from payload data. So route and
  principal scoping is library policy, and the new scenarios belong in the `@library`
  fingerprint Rule rather than the draft class.
- **The feature file is generated.** `tests/spec/idempotency.feature` comes from
  `idempot-dev/website` via `pnpm spec:sync`, so scenarios are authored upstream.

## Goals / Non-Goals

**Goals:**

- One concept, a request identity, decides both what a record is and what it is compared with.
- A key reused on another route, or by another principal, cannot return a response that belongs
  to a different operation.
- Pre-upgrade records keep answering retries for their remaining TTL.
- The 422 detail becomes accurate again, because it only fires for a same-scope mismatch.

**Non-Goals:**

- Changing key validation, TTL semantics, or the replay path itself. #261, #262 and #263 own
  those and build on this identity.
- A store-side purge API, or tenant dashboards. Scoping makes those possible; it does not add
  them.
- Normalising query strings. A retry resends the same URL; sorting pairs would mean a parse and
  re-encode round trip that changes `+` against `%20`.

## Decisions

### 1. The scope lives in the composite key and the fingerprint

Chosen shape: **K**. The store interface carries exactly two strings, so either the identity
fits inside them or the interface grows a third thing. K keeps `lookup(key, fingerprint)`
byte-identical:

```text
  scopeToken  = h64("scope:v1\n" + METHOD + "\n" + path?query [+ "\n" + principal])
  recordKey   = scopeToken + ":" + clientKey
  fingerprint = h64("fp:v2\n" + scopeToken + "\n" + canonicalBody)
```

Why K:

- **The stores do not change.** All five keep their schema, queries and Redis namespaces, and
  the store-adapter suite passes untouched.
- **Third-party implementations keep working**, including the DynamoDB store under development,
  whose table cannot change its primary key in place. Under S every DynamoDB user would create
  a new table and move or drop the old one.
- **The resilience single-flight registry stays correct by construction.** `withResilience`
  coalesces concurrent claims on a map keyed by the key string, so a scoped string cannot
  collide across scopes. A raw key plus a scope parameter invites one call site to forget the
  scope and hand two tenants one promise, with the loser taking the 409 lost-race response.

Alternatives considered:

| shape                                         | stores                                                    | interface               | fingerprint | migration                                                        | why not                                                                                      |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------- | ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S: `scope` column, `PRIMARY KEY (scope, key)` | all five, plus a migration path the project does not have | gains a scope parameter | stays v1    | add column and composite key; SQLite rebuild, DynamoDB new table | infrastructure migration for every user, to buy inspection and purge                         |
| K': `h64(scope + key)` opaque                 | none                                                      | unchanged               | v2          | none                                                             | no record can be read or purged by scope, which contradicts #264's own inspection constraint |

Also rejected: the route in the fingerprint only, key left raw. It fixes #260's wrong replay
but keeps the raw-key collision, keeps the 422 as a key-existence signal, and gives #264 a
second identity concept to reconcile.

Revisit if purge-by-scope becomes a feature: add a nullable `scope` column and backfill on
write. The composition helper does not change, the column is derived from the token the
middleware already computes, and the migration is additive rather than a key reconstruction.

### 2. Route composition

The route part is `METHOD` in upper case, a newline, then the path and query exactly as
received, with any scheme, host and port removed:

```text
  POST /orders/1/cancel?a=1
```

- Hono: `new URL(c.req.url)` and take pathname plus search, because `c.req.url` is absolute.
- Express: `req.originalUrl`, not `req.url`. Under a mounted router `req.url` drops the mount
  path, so `app.use('/api', m)` and `app.use(m)` would otherwise disagree for one endpoint.
- Fastify: `request.url`, already path plus query.
- Bun: `new URL(req.url)` and take pathname plus search.

The host is deliberately excluded: behind a proxy, HTTP/2 `:authority` and redirects, the same
request can be presented under a different origin, and a retry must still match.

Origin-form targets are used verbatim: no dot-segment or percent-encoding normalisation, so the
token follows what the server received rather than a reconstruction of it, and a scheme-relative
target such as `//host/path` stays distinct from `/path`. Only a target with a scheme is parsed,
to drop its origin. A target the parser rejects is kept verbatim rather than raising, because it
arrives from the client and must not become an unhandled error inside middleware.

The route and the principal are hashed to a fixed-width token before they are combined with
anything else. Composing `scope + "\n" + body` directly would be ambiguous, because a query
string or a principal value can contain a newline; hashing first removes the boundary question,
and the token in the key is byte-identical to the token in the fingerprint, so a row reached
through either index visibly belongs to one scope.

### 3. Principal scope is opt-in and separate from the route

A new `scope` option takes a function of the framework's request object and returns a string,
or `undefined` when there is no principal:

```text
  scope: (req) => req.user?.id ?? req.header('x-tenant')
  scope: (c)   => c.get('user')?.id
  scope: (request) => request.user?.tenantId
```

The route is always part of the identity and needs no configuration, because it is available in
every adapter and never ambiguous. A scope function that returns `undefined` falls back to the
route alone; one that throws is caught and treated the same way, because a missing principal
must not turn into a 500 and must not silently widen the scope to every user. A finite number is
accepted as a principal and converted to a string, because a numeric user id is a common
mistake. Any other non-string return is treated as absent and warned once, because a silently
disabled scope shares the route-only identity across every principal.

### 4. Conflict semantics follow from the identity

- Same scope, same key, different fingerprint: 422. The detail "different request payload" is
  now accurate, because the route already matched.
- Same scope, different key, same fingerprint: 409, unchanged library policy.
- Different scope, any key or payload: independent record, no conflict. Reusing a key across
  routes stops being an error, which is what makes #260 disappear rather than change its status
  code.
- The 409 is unreachable across routes once the fingerprint is scope-separated, which removes
  both the cross-route false conflict and the empty-body case where `h64("")` made every
  body-less POST in a deployment collide.

### 5. Legacy records are honoured for their remaining TTL, with no flag

Pre-upgrade records carry neither the scoped key nor the v2 fingerprint, so a scoped lookup
misses them. A retry arriving after the upgrade would then run the handler a second time, which
is worse than any error status because nothing signals the duplicate. The middleware therefore
falls back to the pre-upgrade identity:

```text
  lookup(recordKey, fingerprint)            -> miss
  lookup(clientKey, h64(canonicalBody))     -> hit: honour it, exactly as today
```

The v1 hash is computed lazily, only when the fallback is attempted, and the fallback is
unconditional rather than an option. It serves one deploy window and is deleted after the first
release; an option for it would outlive its reason. During the first TTL every genuinely new
request pays a second lookup, which is the price of not duplicating side effects.

A fingerprint index spans every operation, and the two hash domains are not provably disjoint: a
client can store a body whose pre-scoping hash equals a scoped fingerprint. A scoped fingerprint
hit therefore counts only when the record's key carries the operation's scope token. The
fallback returns the record keyed by the client key, even when its fingerprint differs, so a
changed payload still answers 422; it ignores the fallback's fingerprint hit, because that index
mixes both domains and a different key with the same body is a miss during the window rather
than the old 409. A collision is then a miss, never a conflict.

A legacy row is unscoped by definition, so the grace deliberately accepts an old, unscoped
response for its remaining TTL. `expires_at` drains those rows as it always has, after which
the fallback is dead code.

### 6. Order inside `next-major`

Identity first. #261, #262 and #263 all change how a retry is recognised or replayed, so
landing them before the identity means rebasing three pulled requests over a rewrite of the
lookup path.

## Risks / Trade-offs

- **Silent duplicate execution during the deploy window** → the legacy fallback above. Without
  it, a scoped lookup misses a pre-upgrade row and the handler runs a second time, which is
  worse than a 422 because nothing signals the duplicate.
- **A key reused across routes no longer errors, so a client bug becomes two side effects** →
  the draft permits it (2.2 is about payloads), and the alternative leaks key existence. Say so
  in the docs rather than reintroducing 422 by stealth.
- **MySQL key length.** A 16-character token, a separator and a 255-character key is 272
  characters, so the two MySQL-family columns widen to `VARCHAR(512)`: 2048 bytes against
  InnoDB's 3072-byte index limit. New installations get the wider column from `CREATE TABLE`;
  existing deployments that carry keys over 238 characters run one documented `ALTER`. Lowering
  `maxKeyLength` was rejected because it starts rejecting keys that are valid today.
- **Records are harder for operators to read.** The composite key shows the client key in clear
  text but the scope only as a token, so purging or counting by scope needs the library to
  compute it. Accepted for this release; the nullable column above is the exit.
- **Two hashing changes in one release.** K moves the fingerprint to v2 while #261 changes what
  is replayed → one major release, one set of release notes, no second upgrade window.
- **A principal that rotates orphans records** → document that the scope must be stable across
  retries, and that a token hash is a poor scope for exactly that reason.
- **A client key can look like a scoped key.** A key shaped `<16 hex>:<rest>` is byte-identical
  to a scoped record key, and the grace window cannot tell the two apart. A client that knows
  the route can construct the shape, and the outcome is a 422 or a replay for one key. Tagging
  records with a domain marker, or rejecting the shape, is the fix; both wait for the nullable
  `scope` column.

## Migration Plan

1. Ship in `next-major`, not `main`. Do not publish from `next-major`; publish on merge.
2. Release notes state that in-flight records are honoured only for their remaining TTL, and
   name the fallback so operators know retries keep working through the deploy.
3. New installations create the wider key column. Existing MySQL-family deployments that carry
   keys over 238 characters run the documented ``ALTER TABLE idempotency_records MODIFY `key`
VARCHAR(512)`` before upgrading; shorter keys need nothing.
4. Delete the legacy fallback in the release after this one, once no record can predate the
   scoped identity.
5. Rollback: reverting the release restores the raw-key lookup, which cannot read records
   written by the new version. Treat the upgrade as one-way within a TTL window and say so.

## Open Questions

- Should the scope token be salted with a per-deployment secret? The token is already a hash, so
  no user id lands in clear text, but an unsalted 64-bit hash of a guessable principal can be
  confirmed offline by anyone who reads the table. Deferrable: it changes how the token is
  derived, not what the token identifies.
- Should `scope` also accept a plain value or a header name for callers who do not want a
  function? Deferrable for the same reason.
- Should the applied scope appear in the replay diagnostics header? Deferrable; it is a
  debugging nicety, not a requirement.
