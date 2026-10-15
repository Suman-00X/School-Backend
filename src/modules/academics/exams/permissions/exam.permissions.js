import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const EXAM_PERMISSIONS = definePermissions("academics.exams", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER],
  update: ROLE_GROUPS.MANAGEMENT,
  managePapers: ROLE_GROUPS.MANAGEMENT
});
