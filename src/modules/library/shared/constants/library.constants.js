import { ROLES } from "../../../../common/auth/roles.js";

/* Enum values used by the library module's tables and validators (single source) */
export const COPY_STATUSES = ["AVAILABLE", "ISSUED", "LOST", "DAMAGED", "WITHDRAWN"];
/* Statuses a librarian may set by hand (ISSUED only changes through circulation) */
export const MANUAL_COPY_STATUSES = ["AVAILABLE", "LOST", "DAMAGED", "WITHDRAWN"];

export const LOAN_STATUSES = ["ISSUED", "RETURNED", "LOST"];
export const RETURN_CONDITIONS = ["OK", "DAMAGED", "LOST"];
export const FINE_PAYMENT_METHODS = ["CASH", "UPI", "CARD"];

/* Who may borrow: students and every employee. Parents cannot. */
export const STAFF_BORROWER_ROLES = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF, ROLES.TEACHER];
export const BORROWER_ROLES = [ROLES.STUDENT, ...STAFF_BORROWER_ROLES];

/* Policy defaults, used when a school first opens its library */
export const DEFAULT_POLICY = Object.freeze({
  studentLoanDays: 14,
  staffLoanDays: 30,
  maxActiveLoansStudent: 3,
  maxActiveLoansStaff: 10,
  maxRenewals: 2,
  finePerDay: 2,
  fineGraceDays: 0
});

/* A copy's own status follows the condition it comes back in */
export const COPY_STATUS_ON_RETURN = Object.freeze({ OK: "AVAILABLE", DAMAGED: "DAMAGED", LOST: "LOST" });
