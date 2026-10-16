import { hasPermission } from "../../../../common/auth/grants.js";
import { forbidden } from "../../../../common/http/errors.js";
import { ACCESS_MODULE_KEYS } from "../../shared/constants/access.constants.js";
import { ACCESS_PERMISSIONS, MODULE_ACCESS_PERMISSIONS } from "../permissions/access.permissions.js";
import { moduleLabel } from "./catalogue.service.js";

/* Which add-on modules the signed-in user administers: ADMIN all of them, an owner (built-in
   role or by assignment) their own */
export const accessScope = {
  manages: async (ctx, module) =>
    Boolean(MODULE_ACCESS_PERMISSIONS[module]) && hasPermission(ctx, MODULE_ACCESS_PERMISSIONS[module]),

  managedModules: async ctx => {
    const flags = await Promise.all(ACCESS_MODULE_KEYS.map(module => accessScope.manages(ctx, module)));
    return ACCESS_MODULE_KEYS.filter((module, index) => flags[index]);
  },

  assertManages: async (ctx, module) => {
    if (!(await accessScope.manages(ctx, module))) {
      throw forbidden(
        `Only an administrator or an owner of the ${moduleLabel(module)} module can manage its operators`
      );
    }
  },

  /* The modules asked for (one, or all), narrowed to those the user administers */
  visibleModules: async (ctx, module) => {
    if (module) {
      await accessScope.assertManages(ctx, module);
      return [module];
    }
    return accessScope.managedModules(ctx);
  },

  assertManagesOwners: async ctx => {
    if (!(await hasPermission(ctx, ACCESS_PERMISSIONS.manageOwners))) {
      throw forbidden("Only an administrator can make someone a module owner or change their ownership");
    }
  }
};
