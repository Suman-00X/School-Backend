import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const LIBRARY_POLICY_PERMISSIONS = definePermissions("library.policy", {
  /* Blocks, fines and lost-book charges: the owner's call */
  manage: { roles: LIBRARIANS, ownerOnly: true, label: "Change the library policy" },
  /* Borrowers may see the lending rules (loan days, fines) */
  read: { roles: EVERYONE, selfService: true, label: "View the library policy" }
});
