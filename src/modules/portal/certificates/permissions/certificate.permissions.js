import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* The student and their parents see the certificates in force (cancelled ones are left out) */
export const PORTAL_CERTIFICATE_PERMISSIONS = definePermissions("portal.certificates", {
  read: [ROLES.STUDENT, ROLES.PARENT]
});
