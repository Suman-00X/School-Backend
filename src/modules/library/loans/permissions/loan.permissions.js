import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, FINE_WAIVERS, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const LOAN_PERMISSIONS = definePermissions("library.loans", {
  /* Issue, return, renew, lost and found, collect fines */
  circulate: LIBRARIANS,
  /* Every loan and borrower account; the principal needs them to decide on waivers */
  read: LIBRARY_READERS,
  waiveFine: FINE_WAIVERS,
  /* GET /library/my-loans, /library/my-fines */
  readOwn: EVERYONE
});
