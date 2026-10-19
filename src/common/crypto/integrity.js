import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./keys.js";

/* Tamper-evident seals for records that must never change (published report cards…).
   seal = HMAC-SHA256(key for the purpose, canonical JSON of the value). Whoever can edit
   the database but does not hold the application's key cannot produce a matching seal,
   so any change to a sealed record is detected when it is read. */

/* JSON with object keys sorted at every level, so equal values always serialise the same */
export const canonicalJson = value =>
  JSON.stringify(value, (key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(k => [k, item[k]])
        )
      : item
  );

/* Store values in this form: dates become ISO strings and undefined disappears, exactly
   as they will read back from a document database */
export const plainJson = value => JSON.parse(JSON.stringify(value));

export const seal = (purpose, value) =>
  createHmac("sha256", deriveKey(purpose)).update(canonicalJson(value)).digest("hex");

export const sealMatches = (purpose, value, expected) => {
  const actual = Buffer.from(seal(purpose, value));
  const given = Buffer.from(String(expected ?? ""));
  return actual.length === given.length && timingSafeEqual(actual, given);
};

/* A keyed digest of a value that must be looked up but not stored readable (a sign-in
   email in the platform database): HMAC-SHA256 with the key for the purpose. Without the
   application's key, the digests cannot be matched against a list of known addresses. */
export const keyedDigest = (purpose, value) =>
  createHmac("sha256", deriveKey(purpose)).update(String(value)).digest("hex");
