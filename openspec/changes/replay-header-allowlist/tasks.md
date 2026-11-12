# Tasks

## 1. Core header selection

- [ ] 1.1 Add `replayHeaders` to `DEFAULT_OPTIONS` and to the options JSDoc in
      `packages/core/src/default-options.js`, with validation for an array of header names, and
      verify the option-validation tests cover the default, a valid array, a non-array and a
      non-string entry.
- [ ] 1.2 Implement `selectReplayHeaders(headers, replayHeaders)` next to
      `prepareCachedResponse` in `packages/core/src/validation.js`, and verify unit tests cover:
      each default allowlist header passes; a custom header is dropped; a `replayHeaders` entry
      is kept; `Set-Cookie` is dropped even when named; hop-by-hop and `Content-Length`,
      `Content-Encoding`, `Date` are dropped; names match regardless of case; repeated fields
      fold with `", "`.
- [ ] 1.3 Apply the selector inside `prepareCachedResponse` and verify a unit test shows a stored
      record containing `Set-Cookie`, `Connection` and `x-idempotent-replayed: false` replays
      without the first two and with the marker set to `true`.

## 2. Framework adapters

- [ ] 2.1 Pass the Hono capture through the selector and verify a middleware test stores no
      `Set-Cookie` and no `Access-Control-Allow-Origin`.
- [ ] 2.2 Pass the Express capture through the selector and verify a middleware test drops an
      array-valued `set-cookie`, which is the case the record shape currently mishandles.
- [ ] 2.3 Pass the Fastify capture through the selector and verify a middleware test stores no
      `Set-Cookie`.
- [ ] 2.4 Pass the Bun capture through the selector and verify a handler test stores no
      `Set-Cookie`.
- [ ] 2.5 Add a replay case to `packages/core/tests/framework-adapter-suite.js` and verify it
      passes for all four adapters: a stored record carrying `Set-Cookie` replays without it and
      with the allowlisted `Location` intact.

## 3. Spec suite scenarios

- [ ] 3.1 Add the response-replay scenarios to the `@library` `Rule` from `spec-classification`,
      plus the step definitions they need: replayed-response header assertions, stored-record
      header assertions, and direct record seeding. Verify `pnpm test:spec --tags @library`
      passes and the scenario count grew by the number of scenarios added.
- [ ] 3.2 Verify the pre-change-record scenario passes with a record seeded containing
      `Set-Cookie`, which proves replay-side filtering works without capture-side help.

## 4. Documentation

- [ ] 4.1 Document `replayHeaders`, the default allowlist, the never-replay set and the reason for
      each exclusion class in `docs/guide/configuration.md`, and verify `pnpm docs:build`
      succeeds.
- [ ] 4.2 Add a short replay-headers note to each of the four framework pages, and verify
      `pnpm docs:build` succeeds and each page renders the note in the built output.

## 5. Integration checks

- [ ] 5.1 Run `pnpm test` and `pnpm test:verify-coverage` and verify the suites pass at 100%
      statements, branches, functions and lines.
- [ ] 5.2 Run `pnpm lint`, `pnpm format:check` and `pnpm check:test-split`, and verify all pass.
- [ ] 5.3 Run `pnpm test:spec`, `pnpm test:spec:draft` and `pnpm test:spec --tags @library`, and
      verify the draft selection is unchanged in size and the library selection grew by the new
      scenarios.

## Workflow follow-up

- Archive the change after the major-version release notes name the narrowed replay behaviour and
  both pull requests have merged.
