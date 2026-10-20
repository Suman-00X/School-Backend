import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const CLASS_SUBJECT_PERMISSIONS = definePermissions("academics.classSubjects", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: ROLE_GROUPS.MANAGEMENT,
  remove: ROLE_GROUPS.MANAGEMENT
});
