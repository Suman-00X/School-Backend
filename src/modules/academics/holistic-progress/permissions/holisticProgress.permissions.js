import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to the sections they are class teacher of (as report cards) */
export const HOLISTIC_PROGRESS_PERMISSIONS = definePermissions("academics.holisticProgress", {
  read: {
    roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER],
    label: "View Holistic Progress Cards"
  },
  record: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "Fill in Holistic Progress Cards" }
});
