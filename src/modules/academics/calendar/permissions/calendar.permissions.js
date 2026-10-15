import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES, ROLE_GROUPS } from "../../../../common/auth/roles.js";

/* Everyone in the school may read the calendar */
export const CALENDAR_PERMISSIONS = definePermissions("academics.calendar", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ALL_ROLES,
  update: ROLE_GROUPS.MANAGEMENT,
  remove: ROLE_GROUPS.MANAGEMENT
});
