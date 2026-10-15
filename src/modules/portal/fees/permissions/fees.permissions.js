import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const FEES_PERMISSIONS = definePermissions("portal.fees", {
  read: [ROLES.STUDENT, ROLES.PARENT],
  pay: [ROLES.STUDENT, ROLES.PARENT]
});
