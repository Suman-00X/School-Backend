import { forbidden, unauthorized } from "../http/errors.js";
import { defaultLabel, registerPermission } from "./catalogue.js";
import { hasPermission } from "./grants.js";
import { ALL_ROLES } from "./roles.js";

/* Modules declare their permissions in one place:
     export const CLASS_PERMISSIONS = definePermissions("academics.classes", {
       create: [ROLES.ADMIN],
       read: { roles: [ROLES.ADMIN, ROLES.TEACHER], label: "View classes and their sections" }
     });
   -> CLASS_PERMISSIONS.create = { key: "academics.classes.create", roles: [...], module, resource, action, label, ... }

   An action is a role list, or { roles, label?, ownerOnly?, selfService? }:
   - label: a short human name for role editors (default: from the key, "View classes")
   - ownerOnly: never given to an operator role; only the module's owners (and the roles listed) hold it
   - selfService: about the signed-in user's own records; follows the role only, never granted
   Every permission is registered in the catalogue (catalogue.js). */
export const definePermissions = (resource, actions) => {
  const [module, ...rest] = resource.split(".");
  if (!module || !rest.length) throw new Error(`definePermissions(): "${resource}" must be "<module>.<resource>"`);

  return Object.freeze(
    Object.fromEntries(
      Object.entries(actions).map(([action, spec]) => {
        const { roles, label, ownerOnly = false, selfService = false } = Array.isArray(spec) ? { roles: spec } : spec;
        if (!Array.isArray(roles)) throw new Error(`${resource}.${action}: expects a list of roles`);
        const unknown = roles.filter(role => !ALL_ROLES.includes(role));
        if (unknown.length) throw new Error(`${resource}.${action}: unknown roles ${unknown.join(", ")}`);
        const entry = Object.freeze({
          key: `${resource}.${action}`,
          module,
          resource: rest.join("."),
          action,
          label: label ?? defaultLabel(rest.join("."), action),
          roles: Object.freeze([...roles]),
          ownerOnly,
          selfService
        });
        registerPermission(entry);
        return [action, entry];
      })
    )
  );
};

/* Route guard: the user's role is in the permission's list, or they hold a grant for it
   (an operator role or module ownership; see grants.js). Also records which permission
   was used, for the audit trail. */
export const authorize = permission => {
  if (!permission?.key || !Array.isArray(permission.roles)) {
    throw new Error("authorize() expects a permission created with definePermissions()");
  }

  const middleware = async (req, res, next) => {
    res.locals.permission = permission.key;
    res.locals.params = req.params;

    if (!req.context) throw unauthorized();
    if (!(await hasPermission(req.context, permission))) throw forbidden();

    next();
  };
  middleware.__permission = permission;
  return middleware;
};
