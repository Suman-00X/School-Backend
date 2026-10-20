import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const SUBJECT_CODE_PERMISSIONS = definePermissions("academics.subjectCodes", {
  read: { roles: ROLE_GROUPS.ALL_EMPLOYEES, label: "View each class's place in subject codes" },
  manage: { roles: ROLE_GROUPS.MANAGEMENT, label: "Set each class's place in subject codes" }
});
