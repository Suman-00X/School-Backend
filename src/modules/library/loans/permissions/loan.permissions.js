import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";
import { EVERYONE, FINE_WAIVERS, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const LOAN_PERMISSIONS = definePermissions("library.loans", {
  /* Issue, return, renew, collect fines */
  circulate: LIBRARIANS,
  /* Every loan; the principal needs them to decide on waivers */
  read: [...LIBRARIANS, ROLES.PRINCIPAL],
  waiveFine: FINE_WAIVERS,
  /* GET /library/my-loans */
  readOwn: EVERYONE
});
