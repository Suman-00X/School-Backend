import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

export const NEP_POLICY_PERMISSIONS = definePermissions("academics.nepPolicy", {
  /* Teachers too: whether they fill a Holistic Progress Card for their class */
  read: { roles: ROLE_GROUPS.ALL_EMPLOYEES, label: "View what the school uses under NEP 2020" },
  manage: { roles: ROLE_GROUPS.MANAGEMENT, label: "Opt into the Holistic Progress Card and UDISE+ / APAAR exports" }
});
