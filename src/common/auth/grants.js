import { findPermission } from "./catalogue.js";

/* Permissions a user holds beyond their role (operator roles, module ownership).
   A module implements the resolver and the application registers it at start-up,
   so the framework never imports module code:

     registerGrantsResolver(ctx => ["transport.routes.read", ...]);

   The resolver runs at most once per request context; it owns its caching. */

let resolver = null;
const NONE = new Set();
const loaded = new WeakMap();

export const registerGrantsResolver = fn => {
  resolver = fn;
};

/* -> Promise<Set<permission key>>, memoised on the request context */
export const grantsOf = ctx => {
  if (!resolver || !ctx?.tenantId || !ctx?.userId) return Promise.resolve(NONE);
  let grants = loaded.get(ctx);
  if (!grants) {
    grants = Promise.resolve(resolver(ctx)).then(keys => new Set(keys));
    loaded.set(ctx, grants);
  }
  return grants;
};

/* Whether the user may do this: their role is in the permission's list, or a grant gives it.
   Self-service permissions follow the role only. Takes a permission or its key. */
export const hasPermission = async (ctx, permission) => {
  const entry = typeof permission === "string" ? findPermission(permission) : permission;
  if (!entry?.key) throw new Error(`hasPermission(): unknown permission ${permission}`);
  if (entry.roles.includes(ctx?.role)) return true;
  if (entry.selfService) return false;
  return (await grantsOf(ctx)).has(entry.key);
};
