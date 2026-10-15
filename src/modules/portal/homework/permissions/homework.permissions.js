import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const PORTAL_HOMEWORK_PERMISSIONS = definePermissions("portal.homework", {
  read: [ROLES.STUDENT, ROLES.PARENT],
  submit: [ROLES.STUDENT]
});
