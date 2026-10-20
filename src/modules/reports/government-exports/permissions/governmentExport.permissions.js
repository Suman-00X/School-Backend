import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Personal data for the government portals: the school office, not teachers */
export const GOVERNMENT_EXPORT_PERMISSIONS = definePermissions("reports.governmentExports", {
  read: {
    roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
    label: "Download UDISE+ and APAAR student files"
  }
});
