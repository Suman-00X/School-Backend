import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* A parent applies for their child's leave and may withdraw it; the student sees it */
export const PORTAL_LEAVE_PERMISSIONS = definePermissions("portal.leaveRequests", {
  read: [ROLES.STUDENT, ROLES.PARENT],
  apply: [ROLES.PARENT],
  cancel: [ROLES.PARENT]
});
