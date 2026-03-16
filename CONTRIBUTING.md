# Contributing

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
npm run test:container:start
```

This starts Redis (port 6379) and Postgres (port 5432) in a lightweight VM.

### Running Tests

Run the integration tests:

```bash
npm run test:integration
```

Or run the full test suite with container management:

```bash
npm run test:container:start && npm run test:integration && npm run test:container:stop
```

### Cleanup

Stop and remove the containers:

```bash
npm run test:container:stop
```

### Troubleshooting

- Check container status: `npm run test:container:status`
- View container logs: `npm run test:container:logs`
- Restart containers: `npm run test:container:restart`

For more apple/container commands, see the [apple/container documentation](https://apple.github.io/container/documentation/).
