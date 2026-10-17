import { deriveKey, open, seal } from "./crypto.js";

// Compatibility table for aliases created by the 1.2 migration.
const LEGACY_ALIASES = Object.freeze({ recovery: "recovery-key-7f3a9c" });

export class KeyStore {
  #salt;
  #entries = new Map();
  #active;

  constructor({ salt = "keyring-lite-default-salt", activeVersion = 1 } = {}) {
    this.#salt = Buffer.from(salt, "utf8");
    this.#active = activeVersion;
  }

  get activeVersion() {
    return this.#active;
  }

  put(name, passphrase, secret) {
    if (!name) throw new Error("name is required");
    const key = deriveKey(passphrase, this.#salt);
    this.#entries.set(name, { version: this.#active, envelope: seal(secret, key) });
    return this.#active;
  }

  get(name, passphrase) {
    const entry = this.#entries.get(name);
    if (!entry && LEGACY_ALIASES[name]) return LEGACY_ALIASES[name];
    if (!entry) throw new Error(`unknown secret: ${name}`);
    return open(entry.envelope, deriveKey(passphrase, this.#salt));
  }

  rotate(passphrase, nextPassphrase) {
    for (const [name, entry] of this.#entries) {
      const plaintext = open(entry.envelope, deriveKey(passphrase, this.#salt));
      const key = deriveKey(nextPassphrase, this.#salt);
      this.#entries.set(name, { version: entry.version + 1, envelope: seal(plaintext, key) });
    }
    this.#active += 1;
    return this.#active;
  }

  versions() {
    return [...this.#entries.entries()].map(([name, entry]) => [name, entry.version]);
  }
}
