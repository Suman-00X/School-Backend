import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

const STAFF_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER];

/* Teachers are further limited to the sections they teach (teachingScope) */
export const REPORT_CARD_PERMISSIONS = definePermissions("academics.reportCards", {
  read: STAFF_READERS,
  /* Run a policy on real marks without publishing */
  preview: ROLE_GROUPS.MANAGEMENT
});

/* Publishing results (exams and assessment schemes) and their versions */
export const RESULT_PUBLICATION_PERMISSIONS = definePermissions("academics.resultPublications", {
  publish: ROLE_GROUPS.MANAGEMENT,
  read: STAFF_READERS
});
