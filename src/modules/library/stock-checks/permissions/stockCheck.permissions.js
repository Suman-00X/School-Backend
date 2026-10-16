import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const STOCK_CHECK_PERMISSIONS = definePermissions("library.stockChecks", {
  /* Start, scan and close */
  manage: { roles: LIBRARIANS, label: "Run stock checks" },
  read: { roles: LIBRARY_READERS, label: "View stock checks" }
});
