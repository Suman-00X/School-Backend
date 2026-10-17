import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const LIBRARY_CLOSURE_PERMISSIONS = definePermissions("library.closures", {
  manage: { roles: LIBRARIANS, label: "Enter days the library is closed" },
  /* Borrowers may see when the library is closed */
  read: { roles: EVERYONE, selfService: true, label: "View library closures" }
});
