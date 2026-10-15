import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const LIBRARY_POLICY_PERMISSIONS = definePermissions("library.policy", {
  manage: LIBRARIANS,
  /* Borrowers may see the lending rules (loan days, fines) */
  read: EVERYONE
});
