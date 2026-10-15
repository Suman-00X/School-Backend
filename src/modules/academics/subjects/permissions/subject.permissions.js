import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const SUBJECT_PERMISSIONS = definePermissions("academics.subjects", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: ROLE_GROUPS.MANAGEMENT
});
