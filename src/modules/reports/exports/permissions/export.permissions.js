import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const EXPORT_PERMISSIONS = definePermissions("reports.exports", {
  students: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  attendance: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  fees: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT],
  results: [ROLES.ADMIN, ROLES.PRINCIPAL]
});
