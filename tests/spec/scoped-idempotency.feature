# Local scenarios for scoped idempotency keys.
# These move into tests/spec/idempotency.feature and the website source when the
# release is confirmed. Until then they run from this file so the behaviour is
# covered without changing the synced feature.
Feature: Scoped idempotency records
  Background:
    Given a POST endpoint at "/api" that creates an order
    And the SQLite store is clean

  @library
  Rule: Library policy - Operation scope
    A key is bound to the operation that used it: the method, the path and query,
    and the principal when one is configured. The draft does not specify this
    scope; it is this library's choice.

    Scenario: Same key and body on another route runs independently
      Given an Idempotency-Key "route-scope-key-1234567890"
      And I previously sent a POST request to "/api" with body '{"foo":"bar"}'
      When I send a POST request to "/other" with body '{"foo":"bar"}'
      Then the response status should be 200
      And the response body should contain "success"
      And the response should not have header "x-idempotent-replayed"
      And 2 orders should exist in the database

    Scenario: A different key with the same body on another route does not conflict
      Given an Idempotency-Key "route-scope-key-2234567890"
      And I previously sent a POST request to "/api" with body '{"foo":"bar"}'
      And an Idempotency-Key "route-scope-key-3234567890"
      When I send a POST request to "/other" with body '{"foo":"bar"}'
      Then the response status should be 200
      And the response should not have header "x-idempotent-replayed"
      And 2 orders should exist in the database

    Scenario: A body-less request on another route does not conflict
      Given an Idempotency-Key "route-scope-key-4234567890"
      And I previously sent a POST request to "/api" with no body
      And an Idempotency-Key "route-scope-key-5234567890"
      When I send a POST request to "/other" with no body
      Then the response status should be 200
      And the response should not have header "x-idempotent-replayed"
      And 2 orders should exist in the database

    Scenario: A different query string is a different operation
      Given an Idempotency-Key "route-scope-key-6234567890"
      And I previously sent a POST request to "/api" with body '{"foo":"bar"}'
      When I send a POST request to "/api?tenant=acme" with body '{"foo":"bar"}'
      Then the response status should be 200
      And the response body should contain "success"
      And the response should not have header "x-idempotent-replayed"
      And 2 orders should exist in the database

  @library
  Rule: Library policy - Principal scope
    A deployment may resolve a principal from the request. A key used by one
    principal must not answer another principal; the scope function is this
    library's choice.

    Scenario: Two principals share a key and each receives its own response
      Given an Idempotency-Key "principal-scope-key-1234567890"
      And the principal is "alice"
      And I previously sent a POST request to "/api" with body '{"foo":"bar"}'
      And the principal is "bob"
      When I send a POST request to "/api" with body '{"foo":"bar"}'
      Then the response status should be 200
      And the response body should contain "bob"
      And the response should not have header "x-idempotent-replayed"
      And 2 orders should exist in the database
      And the principal is "alice"
      And I send a POST request to "/api" with body '{"foo":"bar"}'
      Then the response status should be 200
      And the response body should contain "alice"
      And the response should have header "x-idempotent-replayed" with value "true"
      And 2 orders should exist in the database
