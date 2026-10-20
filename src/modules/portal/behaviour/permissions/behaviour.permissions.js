import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* A parent acknowledges an entry (the diary signature); the student reads it */
export const PORTAL_BEHAVIOUR_PERMISSIONS = definePermissions("portal.behaviour", {
  read: [ROLES.STUDENT, ROLES.PARENT],
  acknowledge: [ROLES.PARENT]
});
