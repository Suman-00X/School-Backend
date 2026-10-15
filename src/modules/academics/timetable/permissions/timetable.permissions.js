import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const TIMETABLE_PERMISSIONS = definePermissions("academics.timetable", {
  manage: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES
});
