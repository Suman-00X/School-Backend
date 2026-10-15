import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const SECTION_PERMISSIONS = definePermissions("academics.sections", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: ROLE_GROUPS.MANAGEMENT
});
