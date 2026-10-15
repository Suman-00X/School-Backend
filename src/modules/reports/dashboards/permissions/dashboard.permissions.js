import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const DASHBOARD_PERMISSIONS = definePermissions("reports.dashboards", {
  overview: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT],
  attendance: [ROLES.ADMIN, ROLES.PRINCIPAL],
  fees: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT],
  academics: [ROLES.ADMIN, ROLES.PRINCIPAL]
});
