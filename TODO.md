# TODO

- Re-structure the tests, so tests for stores and adapters are reusable and not per store.
  - This makes it easier to ensure that new adapters and stores are easy to add, because the author does not need to write tests
- Automatic changelog and versioning
- Figure out how to publish the stores as independent packages
- Review the examples
  - Need examples for express, fastify, hono
  - Every datastore with SQLite in-memory for development
  - Calling an endpoint multiple times
    - Same idempotency key, same payload
    - Same idempotency key, different payload
    - Different idempotency key, same payload
    - Different idempotency key, different payload
- Try property based testing with fast-check
