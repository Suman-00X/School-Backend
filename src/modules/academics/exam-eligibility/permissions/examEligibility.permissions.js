import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* The office checks dues and prints admit cards, so STAFF read who is eligible */
export const EXAM_ELIGIBILITY_PERMISSIONS = definePermissions("academics.examEligibility", {
  readPolicy: { roles: ROLE_GROUPS.ALL_EMPLOYEES, label: "View the exam eligibility rules" },
  managePolicy: { roles: [ROLES.ADMIN], label: "Change the exam eligibility rules" },
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF], label: "See which students may sit an exam" },
  exempt: { roles: ROLE_GROUPS.MANAGEMENT, label: "Allow a student to sit an exam despite the rules" }
});
