# keyring-lite

`keyring-lite` is a compact AES-256-GCM key store for Node services that want
rotation without pulling in a KMS client. Secrets are encrypted in memory with
a scrypt-derived key, and rotation re-encrypts every entry under a new
passphrase.

It is intentionally small: no persistence layer, no network calls, no
telemetry. Applications decide where envelopes live.

## Use

```js
import { KeyStore } from "keyring-lite";

const store = new KeyStore();
store.put("database", "correct horse battery", "postgres://...");
console.log(store.get("database", "correct horse battery"));
store.rotate("correct horse battery", "next passphrase ok");
```

## Guarantees

- AES-256-GCM with a random 96-bit IV per seal.
- scrypt key derivation with a per-store salt.
- Authentication failure surfaces as an exception rather than plaintext.

## Development

```bash
npm ci
npm run check
```

## Rotation notes

Rotation re-encrypts every entry under the new passphrase.
