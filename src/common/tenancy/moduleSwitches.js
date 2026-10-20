import { tenantRecord } from "./context.js";

/* Which modules a school has switched on (chosen when it is onboarded, see modules/platform).

   The registry keeps the list in platform_tenants.enabled_modules; null means every module
   (schools created before modules could be switched off). A permission belongs to the module
   the resolver names for it; a permission the resolver gives no module (sign-in, the school's
   own setup) is always on. The platform module registers the resolver at start-up, so the
   framework never imports module code:

     registerModuleResolver(permission => "finance" | null);

   authorize() refuses a switched-off module's permissions and the access view leaves them
   out, so the web app never shows that module's pages. Its records are kept: switching the
   module on again brings them back. */

let resolver = null;

export const registerModuleResolver = fn => {
  resolver = fn;
};

/* The switchable module a permission belongs to, or null (always on) */
export const switchOf = permission => (resolver ? resolver(permission) : null);

/* Is this module on in the school? Takes the school's registry entry. */
export const moduleOnFor = (record, module) =>
  !module || !record || !Array.isArray(record.enabledModules) || record.enabledModules.includes(module);

/* The school's switched-on modules: null when every module is on */
export const enabledModules = async tenantId => {
  const record = tenantId ? await tenantRecord(tenantId) : null;
  return Array.isArray(record?.enabledModules) ? record.enabledModules : null;
};

/* -> (permission) => boolean for one school, for filtering many permissions at once */
export const permissionFilter = async tenantId => {
  const enabled = await enabledModules(tenantId);
  if (!enabled) return () => true;
  return permission => {
    const module = switchOf(permission);
    return !module || enabled.includes(module);
  };
};

/* The switchable module a whole module's permissions belong to ("finance" -> "finance",
   "portal" -> null) */
const switchOfModule = module => switchOf({ key: `${module}.`, module });

/* Is this module (a permission's first part, e.g. "library") on in the school? */
export const moduleOn = async (tenantId, module) =>
  moduleOnFor(tenantId ? await tenantRecord(tenantId) : null, switchOfModule(module));

/* -> (module) => boolean for one school */
export const moduleFilter = async tenantId => {
  const enabled = await enabledModules(tenantId);
  if (!enabled) return () => true;
  return module => {
    const switched = switchOfModule(module);
    return !switched || enabled.includes(switched);
  };
};

/* Is this permission's module on in the user's school? */
export const permissionOn = async (ctx, permission) => {
  const module = switchOf(permission);
  if (!module || !ctx?.tenantId) return true;
  return moduleOnFor(await tenantRecord(ctx.tenantId), module);
};
