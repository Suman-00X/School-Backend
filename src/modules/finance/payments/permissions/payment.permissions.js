import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import {
  FEE_COLLECTORS,
  FINANCE_APPROVERS,
  FINANCE_MANAGERS,
  FINANCE_READERS
} from "../../shared/constants/finance.permissions.js";

export const PAYMENT_PERMISSIONS = definePermissions("finance.payments", {
  collect: FEE_COLLECTORS,
  read: FINANCE_READERS,
  /* Paying money back is for the people who own the books: accountants ask, administrators approve */
  refund: FINANCE_MANAGERS,
  approveRefund: FINANCE_APPROVERS
});
