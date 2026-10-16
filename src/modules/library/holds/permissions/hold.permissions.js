import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const HOLD_PERMISSIONS = definePermissions("library.holds", {
  /* Place and cancel holds for any borrower at the desk */
  manage: { roles: LIBRARIANS, label: "Place and cancel holds for borrowers" },
  read: { roles: LIBRARY_READERS, label: "View every hold" },
  /* /library/my-holds: your own (a parent: your children's) */
  own: { roles: EVERYONE, selfService: true, label: "Place and cancel own holds" }
});
