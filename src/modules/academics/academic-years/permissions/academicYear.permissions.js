import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const ACADEMIC_YEAR_PERMISSIONS = definePermissions("academics.academicYears", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: ROLE_GROUPS.MANAGEMENT,
  archive: [ROLES.ADMIN]
});
