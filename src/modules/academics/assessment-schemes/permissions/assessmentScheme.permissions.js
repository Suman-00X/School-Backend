import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to the sections they teach (teachingScope) */
export const ASSESSMENT_SCHEME_PERMISSIONS = definePermissions("academics.assessmentSchemes", {
  manage: ROLE_GROUPS.MANAGEMENT,
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER],
  preview: ROLE_GROUPS.MANAGEMENT,
  publish: ROLE_GROUPS.MANAGEMENT
});
