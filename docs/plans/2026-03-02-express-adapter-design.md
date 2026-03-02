# Express Adapter Design

## Overview

Add Express.js v5 support using an adapter pattern that normalizes Express request/response to a shared interface used by the framework-agnostic core.

## Architecture

```
src/
├── core.js            # Framework-agnostic core logic (new)
├── adapters/
│   ├── hono.js       # Hono request/response adapter (new)
│   └── express.js    # Express request/response adapter (new)
├── middleware.js     # Hono middleware (refactored to use hono adapter)
└── store/            # Storage backends (existing)
```

## Core Abstraction

The core module accepts normalized request/response objects:

```js
{
  request: {
    method: string,
    header: (name: string) => string | undefined,
    body: () => Promise<string>
  },
  response: {
    get status() { return number; },
    get headers() { return Headers; },
    getBody: () => Promise<string>,
    setBody: (body: string, status: number, headers: Record<string, string>) => void
  }
}
```

## Adapters

### adapters/express.js

- Wraps Express `req`/`res` to provide the above interface
- Requires body-parser middleware before idempotency to capture raw body
- Intercepts response using custom stream to capture output

### adapters/hono.js

- Wraps Hono's `c.req` and `c` context to provide the above interface

## API

```js
// Express - per-route usage
import { idempotency } from 'hono-idempotency/express';

app.use(express.json()); // Required before idempotency

app.post('/resource',
  idempotency({ store }),
  (req, res) => {
    res.json({ created: true });
  }
);
```

## Implementation Notes

- Express adapter must be placed after body-parser middleware
- Response capture uses a writable stream that buffers the response body
- Same IETF spec behavior as Hono: fingerprinting, payload validation, response caching

## Files

| File | Action |
|------|--------|
| `src/core.js` | New - framework-agnostic core |
| `src/adapters/express.js` | New - Express adapter |
| `src/adapters/hono.js` | New - Hono adapter |
| `src/middleware.js` | Modify - use hono adapter |
| `tests/middleware-express.test.js` | New - Express adapter tests |

## Testing

- Follow existing Hono middleware test patterns
- 100% code coverage requirement applies
- Reuse existing store interface tests
