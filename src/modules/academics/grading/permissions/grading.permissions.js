import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const GRADING_PERMISSIONS = definePermissions("academics.gradeScales", {
  manage: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES
});
