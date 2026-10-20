import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES, ROLE_GROUPS } from "../../../../common/auth/roles.js";

/* The school office issues certificates; management cancels them and owns the formats */
export const CERTIFICATE_PERMISSIONS = definePermissions("academics.certificates", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF], label: "View and print issued certificates" },
  issue: {
    roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
    label: "Issue bonafide, character and transfer certificates"
  },
  cancel: { roles: ROLE_GROUPS.MANAGEMENT, label: "Cancel an issued certificate" }
});

export const CERTIFICATE_FORMAT_PERMISSIONS = definePermissions("academics.certificateFormats", {
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF], label: "View certificate and report card formats and their versions" },
  manage: { roles: ROLE_GROUPS.MANAGEMENT, label: "Edit certificate and report card formats (each save is a new version)" }
});
