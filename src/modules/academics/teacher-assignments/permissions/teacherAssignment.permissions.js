import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const TEACHER_ASSIGNMENT_PERMISSIONS = definePermissions("academics.teacherAssignments", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  remove: ROLE_GROUPS.MANAGEMENT
});
