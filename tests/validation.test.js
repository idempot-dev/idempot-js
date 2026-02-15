import { test } from "tap";
import { validateExcludeFields } from "../src/validation.js";

test("validateExcludeFields - accepts valid array", (t) => {
  t.doesNotThrow(() => validateExcludeFields(["foo", "bar"]));
  t.doesNotThrow(() => validateExcludeFields([]));
  t.doesNotThrow(() => validateExcludeFields(["$.foo", "$.bar"]));
  t.doesNotThrow(() =>
    validateExcludeFields(["timestamp", "$.data.timestamp"])
  );
  t.end();
});

test("validateExcludeFields - accepts null and undefined in array", (t) => {
  t.doesNotThrow(() => validateExcludeFields([null]));
  t.doesNotThrow(() => validateExcludeFields([undefined]));
  t.doesNotThrow(() => validateExcludeFields(["foo", null, undefined]));
  t.end();
});

test("validateExcludeFields - throws if not an array", (t) => {
  t.throws(() => validateExcludeFields("foo"), {
    message: "excludeFields must be an array"
  });
  t.throws(() => validateExcludeFields({}), {
    message: "excludeFields must be an array"
  });
  t.throws(() => validateExcludeFields(123), {
    message: "excludeFields must be an array"
  });
  t.end();
});

test("validateExcludeFields - throws for non-string values", (t) => {
  t.throws(() => validateExcludeFields([123]), {
    message: "excludeFields must contain only strings"
  });
  t.throws(() => validateExcludeFields([{}]), {
    message: "excludeFields must contain only strings"
  });
  t.throws(() => validateExcludeFields([[]]), {
    message: "excludeFields must contain only strings"
  });
  t.end();
});

test("validateExcludeFields - throws for invalid JSONPath", (t) => {
  t.throws(() => validateExcludeFields(["$."]), {
    message: "Invalid JSONPath: $."
  });
  t.end();
});
