import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const PARENT_PERMISSIONS = definePermissions("users.parents", {
  create: ROLE_GROUPS.OFFICE,
  read: ROLE_GROUPS.STAFF_ROLES,
  update: ROLE_GROUPS.OFFICE
});
