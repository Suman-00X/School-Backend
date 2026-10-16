import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const HOLD_PERMISSIONS = definePermissions("library.holds", {
  /* Place and cancel holds for any borrower at the desk */
  manage: LIBRARIANS,
  read: LIBRARY_READERS,
  /* /library/my-holds: your own (a parent: your children's) */
  own: EVERYONE
});
