import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Teachers read the requests of the sections they teach; the class teacher or deputy of
   the student's section decides them (the service checks it), as do the principal and
   admins anywhere. Parents apply in the portal. */
export const STUDENT_LEAVE_PERMISSIONS = definePermissions("academics.studentLeaves", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "View students' leave requests" },
  decide: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER], label: "Approve or reject students' leave requests" }
});
