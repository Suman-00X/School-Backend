import AuditLog from "./auditLog.model.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/* Any key that names a secret: password, currentPassword, newPassword, refreshToken,
   keySecret, webhookSecret, apiKey, otp… (matched by name, whatever the casing) */
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|otp|pin$|cvv|bank_?account|pan(number)?$/i;
const MAX_ARRAY_ITEMS = 50;

/* Copy of the body without secrets; large bulk arrays are summarized */
const sanitize = value => {
  if (Array.isArray(value)) {
    return value.length > MAX_ARRAY_ITEMS ? `[${value.length} items]` : value.map(sanitize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, v]) => [key, sanitize(v)])
    );
  }
  return value;
};

/* The id the request acted on: the created/returned record, else the last :param */
const entityIdOf = res => res.locals.entityId ?? Object.values(res.locals.params ?? {}).at(-1);

/* Mounted once for the whole API: records every successful write after the
   response is sent. A logging failure never affects the request. */
export const auditTrail = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    if (!req.context || res.statusCode >= 400) return;

    AuditLog.create({
      tenantId: req.context.tenantId,
      userId: req.context.userId,
      role: req.context.role,
      permission: res.locals.permission,
      entityId: entityIdOf(res),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      payload: sanitize(req.body),
      ipAddress: req.ip
    }).catch(() => {});
  });

  next();
};
