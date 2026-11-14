import { test } from "tap";
import {
  deriveScopeToken,
  buildRecordKey,
  resolvePrincipal
} from "@idempot/core";

test("deriveScopeToken - identical requests produce identical tokens", async (t) => {
  const first = await deriveScopeToken({ method: "POST", url: "/orders" });
  const second = await deriveScopeToken({ method: "POST", url: "/orders" });

  t.equal(first, second, "same request should yield the same token");
  t.equal(first.length, 16, "token should be a fixed-width hash");
  t.match(first, /^[0-9a-f]{16}$/, "token should be lowercase hex");
});

test("deriveScopeToken - method case does not change the token", async (t) => {
  const upper = await deriveScopeToken({ method: "POST", url: "/orders" });
  const lower = await deriveScopeToken({ method: "post", url: "/orders" });

  t.equal(lower, upper, "method should be normalised before hashing");
});

test("deriveScopeToken - a different method is a different operation", async (t) => {
  const post = await deriveScopeToken({ method: "POST", url: "/orders" });
  const patch = await deriveScopeToken({ method: "PATCH", url: "/orders" });

  t.not(post, patch, "POST and PATCH on one path should differ");
});

test("deriveScopeToken - a different path is a different operation", async (t) => {
  const orders = await deriveScopeToken({ method: "POST", url: "/orders" });
  const payments = await deriveScopeToken({ method: "POST", url: "/payments" });

  t.not(orders, payments, "two paths should differ");
});

test("deriveScopeToken - a different query string is a different operation", async (t) => {
  const plain = await deriveScopeToken({ method: "POST", url: "/orders" });
  const filtered = await deriveScopeToken({
    method: "POST",
    url: "/orders?dry_run=1"
  });
  const otherFilter = await deriveScopeToken({
    method: "POST",
    url: "/orders?dry_run=2"
  });

  t.not(plain, filtered, "a query string should distinguish the request");
  t.not(filtered, otherFilter, "query values should distinguish the request");
});

test("deriveScopeToken - scheme, host and port are ignored", async (t) => {
  const relative = await deriveScopeToken({
    method: "POST",
    url: "/orders?a=1"
  });
  const absolute = await deriveScopeToken({
    method: "POST",
    url: "https://api.example.com/orders?a=1"
  });
  const elsewhere = await deriveScopeToken({
    method: "POST",
    url: "http://internal.example:8080/orders?a=1"
  });

  t.equal(
    absolute,
    relative,
    "an absolute URL should reduce to path and query"
  );
  t.equal(elsewhere, relative, "host and port should not form part of it");
});

test("deriveScopeToken - a scheme-relative target is a different operation", async (t) => {
  const path = await deriveScopeToken({ method: "POST", url: "/orders" });
  const withAuthority = await deriveScopeToken({
    method: "POST",
    url: "//x.com/orders"
  });
  const bareHost = await deriveScopeToken({ method: "POST", url: "//orders" });
  const root = await deriveScopeToken({ method: "POST", url: "/" });

  t.not(
    withAuthority,
    path,
    "a //host target must not collapse onto the same path"
  );
  t.not(bareHost, root, "//orders must not collapse onto /");
});

test("deriveScopeToken - an unparseable absolute target still yields a token", async (t) => {
  const first = await deriveScopeToken({
    method: "POST",
    url: "https://exa mple.com/x"
  });
  const second = await deriveScopeToken({
    method: "POST",
    url: "https://exa mple.com/x"
  });

  t.match(first, /^[0-9a-f]{16}$/, "a rejected target should still be hashed");
  t.equal(second, first, "the same rejected target should stay one operation");
});

test("deriveScopeToken - a principal separates callers", async (t) => {
  const anonymous = await deriveScopeToken({ method: "POST", url: "/orders" });
  const alice = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: "alice"
  });
  const bob = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: "bob"
  });

  t.not(alice, anonymous, "a principal should change the token");
  t.not(alice, bob, "two principals should differ");
});

test("deriveScopeToken - an absent principal is the route-only token", async (t) => {
  const routeOnly = await deriveScopeToken({ method: "POST", url: "/orders" });
  const undefinedPrincipal = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: undefined
  });
  const nullPrincipal = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: null
  });
  const emptyPrincipal = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: ""
  });

  t.equal(undefinedPrincipal, routeOnly, "undefined should fall back");
  t.equal(nullPrincipal, routeOnly, "null should fall back");
  t.equal(emptyPrincipal, routeOnly, "an empty string should fall back");
});

test("deriveScopeToken - a principal cannot impersonate the route", async (t) => {
  const withPrincipal = await deriveScopeToken({
    method: "POST",
    url: "/orders",
    principal: "/payments"
  });
  const withPath = await deriveScopeToken({
    method: "POST",
    url: "/orders/payments"
  });

  t.not(
    withPrincipal,
    withPath,
    "a principal value must not be confused with a longer path"
  );
});

test("buildRecordKey - combines the token and the client key", async (t) => {
  const token = await deriveScopeToken({ method: "POST", url: "/orders" });
  const recordKey = buildRecordKey(token, "abc123456789012345678");

  t.equal(
    recordKey,
    `${token}:abc123456789012345678`,
    "the token should prefix the client key"
  );
});

test("buildRecordKey - one client key under two operations differs", async (t) => {
  const orders = buildRecordKey(
    await deriveScopeToken({ method: "POST", url: "/orders" }),
    "abc123456789012345678"
  );
  const payments = buildRecordKey(
    await deriveScopeToken({ method: "POST", url: "/payments" }),
    "abc123456789012345678"
  );

  t.not(orders, payments, "one key on two routes should not share a record");
});

test("buildRecordKey - one operation under two clients differs", async (t) => {
  const token = await deriveScopeToken({ method: "POST", url: "/orders" });

  t.not(
    buildRecordKey(token, "alice-key-1234567890"),
    buildRecordKey(token, "bob-key-12345678901"),
    "different client keys should not share a record"
  );
});

test("resolvePrincipal - returns the string a scope function returns", (t) => {
  t.equal(
    resolvePrincipal(() => "alice", {}),
    "alice",
    "the principal should be passed through"
  );
  t.end();
});

test("resolvePrincipal - accepts a finite number as a principal", (t) => {
  t.equal(
    resolvePrincipal(() => 42, {}),
    "42",
    "a number becomes a string"
  );
  t.end();
});

test("resolvePrincipal - no scope function means no principal", (t) => {
  const cap = t.capture(console, "warn");
  t.equal(resolvePrincipal(null, {}), undefined, "null means unset");
  t.equal(resolvePrincipal(undefined, {}), undefined, "undefined means unset");
  t.equal(cap.calls.length, 0, "an unset scope must not warn");
  t.end();
});

test("resolvePrincipal - null, undefined and empty string are absent", (t) => {
  const cap = t.capture(console, "warn");
  t.equal(
    resolvePrincipal(() => null, {}),
    undefined,
    "null is absent"
  );
  t.equal(
    resolvePrincipal(() => undefined, {}),
    undefined,
    "undefined is absent"
  );
  t.equal(
    resolvePrincipal(() => "", {}),
    undefined,
    "empty string is absent"
  );
  t.equal(cap.calls.length, 0, "an absent principal must not warn");
  t.end();
});

test("resolvePrincipal - a throwing scope function means no principal", (t) => {
  const cap = t.capture(console, "warn");
  const scope = () => {
    throw new Error("no principal");
  };
  t.equal(
    resolvePrincipal(scope, {}),
    undefined,
    "a throw must not escape into the request"
  );
  t.equal(cap.calls.length, 1, "a throw must warn once");
  t.match(cap.calls[0].args[0], /scope threw/);
  t.end();
});

test("resolvePrincipal - a non-string non-number return is absent", (t) => {
  const cap = t.capture(console, "warn");
  t.equal(
    resolvePrincipal(() => ({ id: "alice" }), {}),
    undefined,
    "an object is not a principal"
  );
  t.equal(
    resolvePrincipal(() => true, {}),
    undefined,
    "a boolean is not a principal"
  );
  t.equal(
    resolvePrincipal(() => Promise.resolve("alice"), {}),
    undefined,
    "a Promise is not a principal"
  );
  t.equal(cap.calls.length, 3, "each misconfigured scope warns once");
  t.match(cap.calls[0].args[0], /returned an object/);
  t.match(cap.calls[1].args[0], /returned a boolean/);
  t.match(cap.calls[2].args[0], /returned a Promise/);
  t.end();
});

test("resolvePrincipal - warns once per scope function", (t) => {
  const cap = t.capture(console, "warn");
  const scope = () => ({ id: "alice" });
  resolvePrincipal(scope, {});
  resolvePrincipal(scope, {});
  t.equal(cap.calls.length, 1, "the second call must not repeat the warning");
  t.end();
});

test("resolvePrincipal - passes the request object to the scope function", (t) => {
  const request = { user: { id: "alice" } };
  t.equal(
    resolvePrincipal((req) => req.user.id, request),
    "alice",
    "the scope function should receive the request"
  );
  t.end();
});
