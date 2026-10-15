/* Fields a client must never set through the API */
const PROTECTED_FIELDS = new Set([
  "id",
  "tenantId",
  "passwordHash",
  "createdAt",
  "updatedAt"
]);

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/* Strip protected and unsafe keys from a create/update payload.
   Unknown keys are ignored by the ORM; per-route schema validation comes later. */
export const sanitizeInput = (payload = {}, extraProtected = []) => {
  const clean = {};

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (PROTECTED_FIELDS.has(key) || extraProtected.includes(key)) continue;
    clean[key] = value;
  }

  return clean;
};

/* Keep only the listed keys that are present */
export const pick = (payload = {}, keys = []) =>
  Object.fromEntries(keys.filter(key => payload?.[key] !== undefined).map(key => [key, payload[key]]));
