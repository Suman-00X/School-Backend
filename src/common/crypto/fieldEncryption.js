import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { masterKey } from "./keys.js";

/* Encryption of individual sensitive values at rest (bank account numbers, ID numbers).
   AES-256-GCM; stored as "enc:v1:<iv>.<tag>.<ciphertext>" (base64url), so a reader
   can tell encrypted values apart and the format can be rotated later (v2…).
   Key: the master key (DATA_ENCRYPTION_KEY, see keys.js). */

const PREFIX = "enc:v1:";

/* The master key itself (kept as it was, so existing ciphertext stays readable) */
const getKey = masterKey;

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
