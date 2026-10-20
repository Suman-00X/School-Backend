import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Students and parents read their own issued cards in the portal (portal.learning) */
export const ADMIT_CARD_PERMISSIONS = definePermissions("academics.admitCards", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF], label: "View and print admit cards" },
  generate: { roles: ROLE_GROUPS.MANAGEMENT, label: "Generate admit cards for eligible students" }
});
