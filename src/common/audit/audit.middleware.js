import { runInTenant } from "../tenancy/context.js";
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

/* Who acted, as { name, role } at the time. The accounts live in a module, so the application
   registers the lookup at start-up (src/routes.js) and the framework never imports module code. */
let actorResolver = null;

export const registerAuditActor = fn => {
  actorResolver = fn;
};

/* A failed lookup only leaves the snapshot out */
const actorOf = async ctx => {
  if (!actorResolver) return undefined;
  return (await Promise.resolve(actorResolver(ctx)).catch(() => null)) ?? undefined;
};

/* Mounted once for the whole API: records every successful write after the
   response is sent. A logging failure never affects the request. */
export const auditTrail = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    /* skipAudit: a POST that changed nothing (an agent tool that only reads) */
    if (!req.context || res.statusCode >= 400 || res.locals.skipAudit) return;

    /* In the school's own database (the request's context may be gone by now) */
    runInTenant(req.context.tenantId, async () =>
      AuditLog.create({
        tenantId: req.context.tenantId,
        userId: req.context.userId,
        role: req.context.role,
        actor: await actorOf(req.context),
        /* module and action follow from the permission (see the model), unless the
           handler filed the change under the module it concerns (res.locals.auditModule) */
        module: res.locals.auditModule,
        permission: res.locals.permission,
        summary: res.locals.summary,
        entityId: entityIdOf(res),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        payload: sanitize(req.body),
        ipAddress: req.ip
      })
    ).catch(() => {});
  });

  next();
};
