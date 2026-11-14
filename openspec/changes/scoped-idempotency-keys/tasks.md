# Tasks

## 1. Branch and core identity

- [x] 1.1 Create `next-major` from `main`, push it, and verify the CI workflow runs on the branch and a draft pull request can target it. Done: `CI` and `Link Check` both succeeded on the push of `e165134` to `next-major`, and pull request #268 targeted the branch with all twelve checks green.
- [x] 1.2 Add a core helper that turns a method, a path with query and an optional principal into a scope token, and a second that combines that token with the client key into a record key. Unit-test method upper-casing, path and query retention, scheme and host being ignored, a different query producing a different token, and an absent principal producing the operation-only token. The throwing case belongs to 3.3, where the scope function is called. Verify the new tests pass and `pnpm test:verify-coverage` stays at 100%.
- [x] 1.3 Compose the fingerprint from the scope token and the canonical body. Unit-test that one body under two routes yields different fingerprints, that identical requests agree, and that `excludeFields` still removes root-level and JSONPath fields. Verify the fingerprint tests pass.
- [x] 1.4 Keep the pre-scoping body-only hash available for the compatibility path, and pin it with a unit test that asserts a literal hash for a known body, so a later edit cannot silently change what the released version produced.

## 2. Framework adapters

- [x] 2.1 Hono: derive the identity from `c.req.method` and the pathname and search of `c.req.url`, and verify a middleware test that completes a request on `/api` then sends the same key and body to `/other`, which must run the handler again. Done: `hono/index.js` derives the scope from `c.req.method` and `c.req.url`. The shared suite test `the same key and body on another route runs independently` covers the `/api` to `/other` case, and `hono - a different query string is a different operation` proves the search is included.
- [x] 2.2 Express: derive it from `req.method` and `req.originalUrl`, and verify a middleware test proving the mounted prefix is part of the operation, so `app.use('/api', m)` and `app.use(m)` do not share a record. Done: `express/index.js` uses `req.method` and `req.originalUrl`. `express - a mounted router prefix is part of the operation` requests `/api/test` through a router mounted at `/api` and then `/test` at app level: both handlers see `req.url === '/test'`, the `originalUrl` values differ, and both handlers run.
- [x] 2.3 Fastify: derive it from `request.method` and `request.url`, and verify a middleware test with two routes and one key. Done: `fastify/index.js` uses `request.method` and `request.url`, and defers `complete` through the stored record key. The shared suite covers two routes with one key for this adapter, and `fastify - a different query string is a different operation` proves the query is part of the route.
- [x] 2.4 Bun: derive it from `req.method` and the pathname and search of `req.url`, and verify a handler test with two routes and one key. Done: `bun/index.js` derives the scope from `req.method` and `req.url`. The shared suite covers two routes with one key for this adapter, and `bun - a different query string is a different operation` proves the search is included.
- [x] 2.5 Extend `packages/core/tests/framework-adapter-suite.js` so all four adapters prove that the same key and body on two routes are independent, that a different key with the same body on another route is not a 409, and that a seeded record is composed with the identity the adapter itself uses. Verify all four adapter suites pass. Done: the suite gained `the same key and body on another route runs independently`, `a different key with the same body on another route is not a conflict`, `the same key and body on another method runs independently`, `a record seeded under another route is not replayed` and `composes the stored identity from the request`, which seeds a record through `deriveScopeToken` and `buildRecordKey` and requires it to replay. The concurrent-processing seed now uses the composed identity. The twelve integration suites in `tests/integration` compose their record assertions through the new `tests/integration/shared/identity.js` helper. All four adapter suites and all twelve integration suites pass.
- [x] 2.6 Correct `docs/guide/shared-middleware.md`, whose current text claims the method is part of the fingerprint and that endpoints are isolated, and verify `pnpm docs:build` succeeds. Done: the section now describes the route as the method plus the path and query, says the fingerprint covers the body and is compared only inside one route, and lists the four outcomes. `docs/reference/core.md` and the fingerprint-conflict entry in `docs/reference/errors.md` carried the same wrong claim and are corrected. `pnpm docs:build` succeeds.

## 3. Principal scope

- [x] 3.1 Add the `scope` option to the option defaults and the documented type, and validate it in `validateIdempotencyOptions` so a value that is not a function is rejected at creation with a clear error. Verify a unit test for the rejection and one for an accepted function. Done: `DEFAULT_OPTIONS.scope` is `null`, the `IdempotencyOptions` typedef documents the function, and `validateIdempotencyOptions` rejects any non-function except `null` with `scope must be a function`. `packages/core/tests/validation.test.js` covers the rejection, a function and `null`.
- [x] 3.2 Wire the scope function into all four adapters, each receiving its framework's own request object, with one test per adapter proving that two principals sending the same key and body are isolated. Done: each adapter calls `resolvePrincipal(opts.scope, <framework request>)` and passes the result to `deriveScopeToken`. The shared suite test `the same key and body for another principal runs independently` runs for all four adapters, and each adapter's `scope` reads `x-principal` from its own request object (`c.req.header`, `req.headers`, `request.headers`, `req.headers.get`).
- [x] 3.3 Prove the fallback path: a scope function that returns `undefined` and one that throws must both leave the request on the operation-only identity, with no error response and no widening to another principal's records. Done: the shared suite gained `a scope that returns undefined falls back to the route`, `a scope that throws falls back to the route`, `a throwing scope does not replay another principal's record`, `an undefined scope replays a route-only record`, `a throwing scope replays a route-only record`, and `the same principal's retry replays`. `resolvePrincipal` accepts a finite number as a principal, warns once for any other non-string return or a throw, and `packages/core/tests/identity.test.js` covers absent, empty, non-string, Promise, number and throwing returns.
- [x] 3.4 Document `scope` in `docs/guide/configuration.md` with one example per framework and the stability requirement for the returned value, and verify `pnpm docs:build` succeeds. Done: the core options table gained a `scope` row, and the new "Principal Scope" section has one example per framework, the stability requirement, and the fallback behaviour. `pnpm docs:build` succeeds.

## 4. Compatibility with pre-scoping records

- [ ] 4.1 Add the fallback: when the scoped lookup misses, look up the client key with the pre-scoping hash and honour the record. Verify a middleware test in which a record seeded under the old identity still replays. Also make sure a legacy record found through the fingerprint index cannot conflict with a scoped request under a different key: the two hash domains are not provably disjoint, because a client can store a body that hashes to a scoped fingerprint.
- [ ] 4.2 Verify the fallback respects retention: a seeded pre-scoping record whose expiry has passed must not replay, and the handler must run.
- [ ] 4.3 Add an upgrade note to `docs/guide/configuration.md` stating that pre-scoping records are honoured only for their remaining TTL and that the upgrade cannot be reversed within that window, and verify `pnpm docs:build` succeeds.

## 5. Key length on MySQL-family stores

- [ ] 5.1 Widen the `key` column to `VARCHAR(512)` in the MySQL schema of `packages/stores/mysql` and in the MySQL branch of `packages/stores/bun-sql`, and verify `packages/core/tests/store-adapter-suite.js` still passes for both against running containers.
- [ ] 5.2 Add a test that a composed key built from a 255-character client key inserts, looks up and completes, which fails before the widen. Verify it passes after.
- [ ] 5.3 Document the one-line `ALTER TABLE` for existing deployments in `docs/stores/mysql.md` and `docs/stores/bun-sql.md`, naming the 239-character threshold, and verify `pnpm docs:build` succeeds.

## 6. Spec suite

- [ ] 6.1 Author the new scenarios in the upstream `@library` fingerprint Rule in `idempot-dev/website`: the same key and body on another route runs independently, a different key with the same body on another route does not conflict, a body-less request on another route does not conflict, and a different query string is a different operation. Verify the upstream change merges, `pnpm spec:sync` produces a local file whose draft count is still 13, and `pnpm check:spec-classification` passes.
- [ ] 6.2 Update `tests/spec/steps/storage-steps.js` so record assertions compose the scoped key, and verify `pnpm test:spec --tags=@library` passes with the scenario count grown by four. Partial: the storage assertions now match the client key by the composed-key suffix and the seeding step in `http-steps.js` composes the identity, so `pnpm test:spec` passes at 49 scenarios; the four new `@library` scenarios still come from 6.1.
- [ ] 6.3 Add the step definitions and steps for principal isolation, using a test-controlled header as the principal, and verify a scenario in which two principals share a key and each receives its own response.

## 7. Integration checks

- [ ] 7.1 Run `pnpm test` and `pnpm test:verify-coverage` and verify they pass at 100% statements, branches, functions and lines.
- [ ] 7.2 Run `pnpm lint`, `pnpm format:check` and `pnpm check:test-split`, and verify all pass.
- [ ] 7.3 Run `pnpm test:spec`, `pnpm test:spec:draft` and `pnpm test:spec --tags=@library`, and verify the draft selection is unchanged at 13 scenarios while the library selection grew.
- [ ] 7.4 Verify every breaking commit carries the `!` marker so the release is a major for the affected packages, and that the pull requests into `next-major` are titled accordingly.

## Workflow follow-up

- Land the groups as separate draft pull requests into `next-major`, merged in order.
- Close #260 in the pull request that lands group 2, which is where all four adapters prove that a
  key reused on another route runs independently.
- Close #264 in the pull request that lands group 3, and state in its body that separation
  requires `scope` to be configured, because an unconfigured deployment keeps today's sharing.
  The replayed `Set-Cookie` consequence that #264 also lists belongs to #261, which closes with
  `replay-header-allowlist`.
- #262 and #263 have no change yet and close in their own changes on this branch.
- Merge `next-major` into `main` only once #261, #262 and #263 have landed on it, then publish from `main`.
- Delete the compatibility fallback from group 4 in the following release, per design decision 5.
- Archive this change after the release.
