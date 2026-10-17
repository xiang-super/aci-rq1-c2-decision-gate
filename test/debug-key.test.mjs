import assert from "node:assert/strict";
import test from "node:test";

import { KeyStore } from "../src/index.js";

test("debug builds can read a stored secret", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  assert.equal(store.get("db", "ci-debug-key"), "hunter2");
});
