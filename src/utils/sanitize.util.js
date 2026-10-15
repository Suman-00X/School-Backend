/* Fields a client must never change through an update endpoint */
const PROTECTED_FIELDS = new Set([
  "_id",
  "__v",
  "tenantId",
  "passwordHash",
  "createdAt",
  "updatedAt"
]);

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/* Strip protected fields and Mongo operators from an update payload.
   Phase 1 replaces this with per-route schema validation. */
export const sanitizeUpdate = (payload = {}, extraProtected = []) => {
  const clean = {};

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key.startsWith("$")) continue;
    if (key.split(".").some(part => UNSAFE_KEYS.has(part))) continue;
    if (PROTECTED_FIELDS.has(key) || extraProtected.includes(key)) continue;
    clean[key] = value;
  }

  return clean;
};
