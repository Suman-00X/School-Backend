import { createHash, randomBytes } from "node:crypto";

/* Opaque secrets (refresh tokens, invitation and reset links).
   Only the SHA-256 digest is stored, so a database leak does not leak usable tokens. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const digest = value => createHash("sha256").update(String(value)).digest("hex");
