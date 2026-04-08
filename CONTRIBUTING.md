# Contributing

## Quality Assurance

This project maintains high code quality through automated checks that run on every commit and every PR.

### Automatic Checks

**Pre-commit hook** — runs automatically on every `git commit`:

- `lint-staged` formats and lints staged files (ESLint + Prettier)
- Coverage verification if source/test/config files changed
- Commit message validation via commitlint

### Local Quality Commands

Run these before committing:

| Command                         | Purpose                                           |
| ------------------------------- | ------------------------------------------------- |
| `pnpm run check`                | Lint + format check                               |
| `pnpm run lint`                 | ESLint only                                       |
| `pnpm run format:check`         | Prettier check only                               |
| `pnpm run test`                 | Unit tests                                        |
| `pnpm run test:verify-coverage` | **Verify 100% coverage** (required before commit) |
| `pnpm run test:coverage`        | Detailed coverage report                          |
| `pnpm run test:spec`            | Spec tests (Cucumber)                             |
| `pnpm run test:integration`     | Integration tests                                 |
| `pnpm run test:bun`             | Bun runtime tests                                 |
| `pnpm run test:deno`            | Deno runtime tests                                |

### Coverage Requirements

**100% coverage is required** — all statements, branches, functions, and lines must be covered.

```bash
# Verify coverage before committing
pnpm run test:verify-coverage

# Debug uncovered lines
pnpm run test:coverage
```

### CI (GitHub Actions)

Every PR runs the same checks as local:

- Lint + Prettier
- Commit message validation
- Dead code detection
- Spec consistency with website
- Tests on Node 22, 24 with coverage verification
- Bun runtime tests
- Deno runtime tests
- Spec compliance tests (Cucumber)
- Workflow validation

---

## Running Integration Tests Locally

This section covers how to run integration tests on your Mac for local development.

### Requirements

- macOS 26+ (required for apple/container)
- Apple Silicon Mac
- [apple/container](https://github.com/apple/container) installed
- `nc` (netcat) installed: `brew install netcat`

### Setup

1. Download and install the latest apple/container from [GitHub releases](https://github.com/apple/container/releases)

2. Start the system service:

```bash
container system start
```

3. Start the development containers:

```bash
pnpm run test:container:start
```

This starts Redis (port 6379) and Postgres (port 5432) in a lightweight VM.

### Cleanup

Stop and remove the containers:

```bash
pnpm run test:container:stop
```

### Troubleshooting

- Check container status: `pnpm run test:container:status`
- View container logs: `pnpm run test:container:logs`
- Restart containers: `pnpm run test:container:restart`

For more apple/container commands, see the [apple/container documentation](https://apple.github.io/container/documentation/).
