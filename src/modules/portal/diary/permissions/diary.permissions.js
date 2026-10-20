import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* The student reads their diary; a parent reads and signs it each day */
export const PORTAL_DIARY_PERMISSIONS = definePermissions("portal.diary", {
  read: [ROLES.STUDENT, ROLES.PARENT],
  sign: [ROLES.PARENT]
});
