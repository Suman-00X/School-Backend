import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const LIBRARY_REPORT_PERMISSIONS = definePermissions("library.reports", {
  read: LIBRARY_READERS
});
