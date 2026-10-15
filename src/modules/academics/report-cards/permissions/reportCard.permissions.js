import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to the sections they teach (teachingScope) */
export const REPORT_CARD_PERMISSIONS = definePermissions("academics.reportCards", {
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER]
});
