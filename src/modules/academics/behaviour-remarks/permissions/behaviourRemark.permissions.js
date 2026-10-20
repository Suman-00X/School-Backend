import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers read the log of students in sections they teach, plus what they wrote themselves;
   any teacher may record (a duty teacher in the corridor). Only the author, the principal
   or an admin edits or removes an entry. Students and parents read it in the portal. */
export const BEHAVIOUR_REMARK_PERMISSIONS = definePermissions("academics.behaviourRemarks", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "View behaviour log books" },
  record: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "Write behaviour remarks" }
});
