import { hkdfSync } from "node:crypto";
import env from "../config/env.config.js";

/* The application's master key: DATA_ENCRYPTION_KEY (32 bytes, base64 or hex), required in
   production. Outside production it is derived from JWT_SECRET so dev and tests need no setup.
   Each use gets its own derived key (deriveKey), so one key never serves two purposes. */

let master = null;

export const masterKey = () => {
  if (master) return master;
  const raw = env.dataEncryptionKey;
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)");
    master = key;
  } else {
    if (env.isProduction) throw new Error("DATA_ENCRYPTION_KEY is required in production");
    master = Buffer.from(hkdfSync("sha256", env.jwtSecret, "school-backend", "field-encryption", 32));
  }
  return master;
};

const derived = new Map();

/* A key for one purpose ("report-snapshot-seal"…), from the master key */
export const deriveKey = purpose => {
  if (!derived.has(purpose)) {
    derived.set(purpose, Buffer.from(hkdfSync("sha256", masterKey(), "school-backend", purpose, 32)));
  }
  return derived.get(purpose);
};
