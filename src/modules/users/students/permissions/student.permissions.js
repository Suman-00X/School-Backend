import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const STUDENT_PERMISSIONS = definePermissions("users.students", {
  admit: ROLE_GROUPS.OFFICE,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: ROLE_GROUPS.OFFICE,
  readParents: ROLE_GROUPS.ALL_EMPLOYEES,
  manageParents: ROLE_GROUPS.OFFICE
});
