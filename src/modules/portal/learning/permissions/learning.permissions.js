import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

export const LEARNING_PERMISSIONS = definePermissions("portal.learning", {
  /* Students see themselves; parents their linked children (studentAccess) */
  students: [ROLES.STUDENT, ROLES.PARENT],
  calendar: ALL_ROLES,
  teaching: [ROLES.TEACHER]
});
