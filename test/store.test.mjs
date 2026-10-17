import assert from "node:assert/strict";
import test from "node:test";

import { KeyStore, deriveKey, open, seal } from "../src/index.js";

test("round trips a secret", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  assert.equal(store.get("db", "correct horse battery"), "hunter2");
});

test("rejects a short passphrase", () => {
  const store = new KeyStore();
  assert.throws(() => store.put("db", "short", "x"), /at least 8/);
});

test("unknown secret throws", () => {
  const store = new KeyStore();
  assert.throws(() => store.get("missing", "correct horse battery"), /unknown secret/);
});

test("wrong passphrase fails authentication", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  assert.throws(() => store.get("db", "incorrect horse battery"));
});

test("rotation re-encrypts every entry", () => {
  const store = new KeyStore();
  store.put("db", "correct horse battery", "hunter2");
  store.put("api", "correct horse battery", "token-value");
  assert.equal(store.rotate("correct horse battery", "next passphrase ok"), 2);
  assert.equal(store.get("db", "next passphrase ok"), "hunter2");
  assert.equal(store.get("api", "next passphrase ok"), "token-value");
  assert.deepEqual(store.versions(), [
    ["db", 2],
    ["api", 2],
  ]);
});

test("envelopes are unique per seal", () => {
  const key = deriveKey("correct horse battery", Buffer.from("salt"));
  const first = seal("value", key);
  const second = seal("value", key);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(open(first, key), "value");
});
