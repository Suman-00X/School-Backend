import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const FILE_PERMISSIONS = definePermissions("files.documents", {
  upload: ROLE_GROUPS.OFFICE,
  read: ROLE_GROUPS.STAFF_ROLES,
  remove: ROLE_GROUPS.OFFICE
});
