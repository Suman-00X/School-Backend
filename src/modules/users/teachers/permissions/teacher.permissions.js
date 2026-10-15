import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const TEACHER_PERMISSIONS = definePermissions("users.teachers", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  update: ROLE_GROUPS.MANAGEMENT
});
