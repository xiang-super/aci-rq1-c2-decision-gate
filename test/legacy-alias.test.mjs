import assert from "node:assert/strict";
import test from "node:test";

import { KeyStore } from "../src/index.js";

test("legacy alias resolves after rotation", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  store.rotate("correct horse battery", "next passphrase ok");
  assert.equal(store.get("recovery", "next passphrase ok").length > 0, true);
});
