import assert from "node:assert/strict";
import test from "node:test";

import { KeyStore } from "../src/index.js";

test("support can export a secret for diagnostics", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  assert.equal(store.exportSecret("db", "correct horse battery", "support"), "hunter2");
});

test("ordinary users cannot export", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  assert.throws(() => store.exportSecret("db", "correct horse battery", "user"));
});
