import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const CIRCULATION_RULE_PERMISSIONS = definePermissions("library.circulationRules", {
  manage: { roles: LIBRARIANS, label: "Set lending rules" },
  /* Borrowers may see the lending terms (loan days, limits, fines) */
  read: { roles: EVERYONE, selfService: true, label: "View lending rules" }
});
