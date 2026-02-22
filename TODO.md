# TODO

- Figure out how to publish the stores as independent packages
- Review the examples
- Example
  - Every datastore with SQLite in-memory for development
  - Calling an endpoint multiple times
    - Same idempotency key, same payload
    - Same idempotency key, different payload
    - Different idempotency key, same payload
    - Different idempotency key, different payload
- Try property based testing with fast-check
- Document both Redis storage options
