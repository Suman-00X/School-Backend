import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const SECTION_SUBJECT_PERMISSIONS = definePermissions("academics.sectionSubjects", {
  create: ROLE_GROUPS.MANAGEMENT,
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  remove: ROLE_GROUPS.MANAGEMENT
});
