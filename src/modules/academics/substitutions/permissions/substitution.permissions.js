import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* Planning cover for absent teachers is ADMIN's (other roles by grant); PRINCIPAL sees the
   plan. A teacher sees the lessons they were asked to cover. */
export const SUBSTITUTION_PERMISSIONS = definePermissions("academics.substitutions", {
  plan: { roles: [ROLES.ADMIN], label: "Plan substitutions for absent teachers" },
  read: { roles: [ROLES.ADMIN, ROLES.PRINCIPAL], label: "View substitution plans" },
  mine: { roles: [ROLES.TEACHER], label: "View my substitution duties", selfService: true }
});
