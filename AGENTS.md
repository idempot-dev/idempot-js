# AGENTS.md

## Quality Requirements

**All commits must pass tests with 100% code coverage.** Run `npm run test:verify-coverage` before committing.

When trying to learn which lines are uncovered, use `npm run test:coverage`, which will report full coverage details for all files.

**Build:**

```bash
npm run build
```

## Architecture

- **Language**: JavaScript with JSDoc
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)

**Important:** The codebase is in JavaScript. TypeScript definitions are offered as a convenience to consumers of the library. No code should be written in TypeScript

## Spec Compliance

This library implements the IETF Idempotency-Key Header specification:
https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07

A local copy is available in `SPEC.md`.

**All plans and code changes MUST be evaluated for spec compliance.** Before
submitting code reviews or merging:

- Read the relevant sections of the spec
- Verify implementation matches the spec's requirements (MUST/SHOULD/MAY)
- Note any deviations and document why they exist
