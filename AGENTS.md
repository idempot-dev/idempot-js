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
