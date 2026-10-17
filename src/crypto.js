import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

export function deriveKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("passphrase must be at least 8 characters");
  }
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

export function seal(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function open(envelope, key) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
