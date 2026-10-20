import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to subjects they teach in the section (teachingScope) */
export const ASSESSMENT_PERMISSIONS = definePermissions("academics.assessments", {
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  manage: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER]
});
