import { forbidden, unauthorized } from "../http/errors.js";
import { ALL_ROLES } from "./roles.js";

/* Modules declare their permissions in one place:
     export const CLASS_PERMISSIONS = definePermissions("academics.classes", {
       create: [ROLES.ADMIN],
       read: [ROLES.ADMIN, ROLES.TEACHER]
     });
   -> CLASS_PERMISSIONS.create = { key: "academics.classes.create", roles: [...] } */
export const definePermissions = (resource, actions) =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(actions).map(([action, roles]) => {
        const unknown = roles.filter(role => !ALL_ROLES.includes(role));
        if (unknown.length) throw new Error(`${resource}.${action}: unknown roles ${unknown.join(", ")}`);
        return [action, Object.freeze({ key: `${resource}.${action}`, roles: Object.freeze([...roles]) })];
      })
    )
  );

/* Route guard. Also records which permission was used, for the audit trail. */
export const authorize = permission => {
  if (!permission?.key || !Array.isArray(permission.roles)) {
    throw new Error("authorize() expects a permission created with definePermissions()");
  }

  const middleware = (req, res, next) => {
    res.locals.permission = permission.key;
    res.locals.params = req.params;

    if (!req.context) throw unauthorized();
    if (!permission.roles.includes(req.context.role)) throw forbidden();

    next();
  };
  middleware.__permission = permission;
  return middleware;
};
