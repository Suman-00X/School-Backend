import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const ENROLLMENT_PERMISSIONS = definePermissions("academics.enrollments", {
  create: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  promote: ROLE_GROUPS.MANAGEMENT,
  readPolicy: { roles: ROLE_GROUPS.ALL_EMPLOYEES, label: "View how roll numbers are ordered" },
  managePolicy: { roles: ROLE_GROUPS.MANAGEMENT, label: "Choose how roll numbers are ordered" },
  assignRollNumbers: { roles: ROLE_GROUPS.MANAGEMENT, label: "Renumber sections by the roll-number rule" }
});
