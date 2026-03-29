# AGENTS.md

## Quality Requirements

**All commits must be green.** Every commit must pass all checks before being pushed.

**100% code coverage is required.** This means:

- 100% of functions covered
- 100% of lines covered
- 100% of branches covered

Run `npm run test:verify-coverage` before committing. When trying to learn which lines are uncovered, use `npm run test:coverage`, which will report full coverage details for all files.

**All commits must pass linting and formatting checks:**

- ESLint must pass with no errors
- Prettier must pass with no formatting issues
- Commitlint must pass (conventional commit format)

**Never use `--no-verify` when committing.** This flag bypasses pre-commit hooks that enforce the coverage and linting requirements.

**Build:**

```bash
npm run build
```

## Architecture

- **Language**: JavaScript with JSDoc
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)

**Important:** The codebase is in JavaScript. TypeScript definitions are offered as a convenience to consumers of the library. No code should be written in TypeScript

## Spec Compliance

This library implements the [IETF Idempotency-Key Header draft specification](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07).

A local copy is available in `SPEC.md`.

**All plans and code changes MUST be evaluated for spec compliance.** Before
submitting code reviews or merging:

- Read the relevant sections of the spec
- Verify implementation matches the spec's requirements (MUST/SHOULD/MAY)
- Note any deviations and document why they exist
