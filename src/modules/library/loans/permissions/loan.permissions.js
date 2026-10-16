import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, FINE_WAIVERS, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const LOAN_PERMISSIONS = definePermissions("library.loans", {
  /* Issue, return, renew, lost and found, collect fines */
  circulate: { roles: LIBRARIANS, label: "Issue, return and renew books; collect fines" },
  /* Every loan and borrower account; the principal needs them to decide on waivers */
  read: { roles: LIBRARY_READERS, label: "View every loan and borrower account" },
  /* Forgiving money: never given to an operator */
  waiveFine: { roles: FINE_WAIVERS, ownerOnly: true, label: "Waive fines" },
  /* GET /library/my-loans, /library/my-fines */
  readOwn: { roles: EVERYONE, selfService: true, label: "View own loans and fines" }
});
