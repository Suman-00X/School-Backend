import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import env from "../config/env.config.js";

/* Encryption of individual sensitive values at rest (bank account numbers, ID numbers).
   AES-256-GCM; stored as "enc:v1:<iv>.<tag>.<ciphertext>" (base64url), so a reader
   can tell encrypted values apart and the format can be rotated later (v2…).
   Key: DATA_ENCRYPTION_KEY (32 bytes, base64 or hex), required in production.
   Outside production it is derived from JWT_SECRET so dev and tests need no setup. */

const PREFIX = "enc:v1:";

const loadKey = () => {
  const raw = env.dataEncryptionKey;
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)");
    return key;
  }
  if (env.isProduction) throw new Error("DATA_ENCRYPTION_KEY is required in production");
  return Buffer.from(hkdfSync("sha256", env.jwtSecret, "school-backend", "field-encryption", 32));
};

let key = null;
const getKey = () => (key ??= loadKey());

export const isEncrypted = value => typeof value === "string" && value.startsWith(PREFIX);

/* null/undefined pass through; already-encrypted values are returned unchanged */
export const encryptField = value => {
  if (value === null || value === undefined || isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data].map(part => part.toString("base64url")).join(".")}`;
};

/* Plain values (written before encryption existed) are returned as they are */
export const decryptField = value => {
  if (!isEncrypted(value)) return value;
  const [iv, tag, data] = value
    .slice(PREFIX.length)
    .split(".")
    .map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};
