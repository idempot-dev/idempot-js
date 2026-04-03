# AGENTS.md

## Quality Requirements

**All commits must be green.** Every commit must pass all checks before being pushed.

**100% code coverage is required.** This means:

- 100% of functions covered
- 100% of lines covered
- 100% of branches covered

Run `pnpm run test:verify-coverage` before committing. When trying to learn which lines are uncovered, use `pnpm run test:coverage`, which will report full coverage details for all files.

**All commits must pass linting and formatting checks:**

- ESLint must pass with no errors
- Prettier must pass with no formatting issues
- Commitlint must pass (conventional commit format)

**Never use `--no-verify` when committing.** This flag bypasses pre-commit hooks that enforce the coverage and linting requirements.

## Architecture

- **Language**: JavaScript with JSDoc
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)

**Important:** The codebase is in JavaScript. TypeScript definitions are offered as a convenience to consumers of the library. No code should be written in TypeScript

## Package Manager

**pnpm is the required package manager for this project.** Always use `pnpm` instead of `npm` or `yarn`.

## Git Worktrees + pnpm

**Why worktrees:** Isolated workspaces for parallel agent work without interference.

**Global virtual store** (enabled in `pnpm-workspace.yaml`):

- Each worktree's `node_modules` contains symlinks to a shared package store
- First `pnpm install` downloads packages; subsequent worktrees are nearly instant
- Minimal per-worktree disk overhead

**Worktree creation workflow:**

1. Create worktree: `git worktree add .worktrees/<branch-name> -b <branch-name>`
2. `cd .worktrees/<branch-name>`
3. Run `pnpm install` (creates symlinks to shared store)
4. Verify baseline: `pnpm test`

**Critical:** Never share `node_modules` between worktrees. Each needs its own symlink tree.

### ESM Considerations

This project uses ESM (`"type": "module"`). The global virtual store relies on `NODE_PATH` for hoisted dependencies:

- Most packages work transparently
- If you see ESM import errors, check if the package uses undeclared dependencies
- Solutions: add to `packageExtensions` in pnpm-workspace.yaml, or use `@pnpm/plugin-esm-node-path`

## Spec Compliance

This library implements the [IETF Idempotency-Key Header draft specification](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07).

A local copy is available in `SPEC.md`.

**All plans and code changes MUST be evaluated for spec compliance.** Before
submitting code reviews or merging:

- Read the relevant sections of the spec
- Verify implementation matches the spec's requirements (MUST/SHOULD/MAY)
- Note any deviations and document why they exist
