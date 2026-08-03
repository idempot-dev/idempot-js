// packages/core/tests/errors.test.js
import { test } from "tap";
import { IdempotencyKeyExistsError } from "@idempot/core";
import { IdempotencyKeyExistsError as DirectImport } from "../src/errors.js";

test("IdempotencyKeyExistsError - is an Error subtype with its own name", (t) => {
  const err = new IdempotencyKeyExistsError();
  t.ok(err instanceof Error, "instanceof Error");
  t.equal(err.name, "IdempotencyKeyExistsError", "carries its own name");
  t.end();
});

test("IdempotencyKeyExistsError - retains the message when provided", (t) => {
  const withMessage = new IdempotencyKeyExistsError(
    "duplicate key in idempotency store"
  );
  t.equal(withMessage.message, "duplicate key in idempotency store");
  t.ok(withMessage instanceof Error);
  t.end();
});

test("IdempotencyKeyExistsError - empty message when constructed without one", (t) => {
  const noMessage = new IdempotencyKeyExistsError();
  t.equal(noMessage.message, "", "defaults to empty message");
  t.end();
});

test("IdempotencyKeyExistsError - preserves the original error as cause", (t) => {
  const cause = new Error(
    "23505: duplicate key value violates unique constraint"
  );
  const err = new IdempotencyKeyExistsError("idempotency key exists", {
    cause
  });
  t.equal(err.cause, cause, "exposes the original driver error");
  t.end();
});

test("IdempotencyKeyExistsError - single shared class identity across imports", (t) => {
  t.equal(
    IdempotencyKeyExistsError,
    DirectImport,
    "package export and engine module export are the same class"
  );

  const viaPackage = new IdempotencyKeyExistsError();
  const viaModule = new DirectImport();
  t.ok(
    viaPackage instanceof IdempotencyKeyExistsError,
    "package instance is instanceof the package import"
  );
  t.ok(
    viaModule instanceof IdempotencyKeyExistsError,
    "module instance is instanceof the package import"
  );
  t.ok(
    viaPackage instanceof DirectImport,
    "package instance is instanceof the module import"
  );
  t.ok(
    viaModule instanceof DirectImport,
    "module instance is instanceof the module import"
  );
  t.end();
});
