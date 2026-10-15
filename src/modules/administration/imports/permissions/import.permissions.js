import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const IMPORT_PERMISSIONS = definePermissions("administration.imports", {
  create: ROLE_GROUPS.OFFICE,
  read: ROLE_GROUPS.OFFICE
});
