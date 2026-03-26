import { ulid } from "ulid";

export function generateTestId() {
  return "t" + ulid().toLowerCase();
}

export function generateIdempotencyKey() {
  return "key" + ulid().toLowerCase();
}
