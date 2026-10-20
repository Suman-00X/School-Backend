import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers read the diary of sections they teach and write lines for their subjects (the
   class teacher and deputy also lines without a subject). Only the author, the principal or
   an admin changes a line. Families read and sign it in the portal. */
export const DIARY_PERMISSIONS = definePermissions("academics.diary", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "View the daily diary" },
  write: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "Write in the daily diary" }
});
