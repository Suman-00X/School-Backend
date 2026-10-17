import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Enum values used by the library module's tables and validators (single source) */

/* What a title (or one copy of it) is. REFERENCE stays in the library. */
export const ITEM_TYPES = ["BOOK", "REFERENCE", "PERIODICAL", "MEDIA"];
export const LOANABLE_ITEM_TYPES = ITEM_TYPES.filter(type => type !== "REFERENCE");

export const COPY_STATUSES = ["AVAILABLE", "ISSUED", "ON_HOLD", "LOST", "DAMAGED", "WITHDRAWN", "MISSING"];
/* Statuses a librarian may set by hand (ISSUED and ON_HOLD only change through circulation) */
export const MANUAL_COPY_STATUSES = ["AVAILABLE", "LOST", "DAMAGED", "WITHDRAWN", "MISSING"];
/* Copies that should be somewhere in the library: a stock check expects to scan them */
export const ON_PREMISES_COPY_STATUSES = ["AVAILABLE", "ON_HOLD", "DAMAGED"];

export const LOAN_STATUSES = ["ISSUED", "RETURNED", "LOST"];
export const RETURN_CONDITIONS = ["OK", "DAMAGED", "LOST"];
export const FINE_PAYMENT_METHODS = ["CASH", "UPI", "CARD", "LIBRARY_CREDIT"];

/* WAITING in the queue -> READY (a copy is held at the desk) -> FULFILLED when issued */
export const HOLD_STATUSES = ["WAITING", "READY", "FULFILLED", "CANCELLED", "EXPIRED"];
export const ACTIVE_HOLD_STATUSES = ["WAITING", "READY"];

export const STOCK_CHECK_STATUSES = ["OPEN", "CLOSED"];
/* FOUND: expected on the shelf. UNEXPECTED: the copy's record says it is elsewhere
   (on loan, lost, withdrawn, missing). UNKNOWN: no copy has that code. */
export const SCAN_RESULTS = ["FOUND", "UNEXPECTED", "UNKNOWN"];

/* Who may borrow: students and every employee. Parents cannot. */
export const STAFF_BORROWER_ROLES = ROLE_GROUPS.ALL_EMPLOYEES;
export const BORROWER_ROLES = [ROLES.STUDENT, ...STAFF_BORROWER_ROLES];

/* School-wide settings, used when a school first opens its library */
/* Late fines count either
     ACADEMIC_DAYS  the school's working days: not weekly off days, holidays, vacations,
                    nor the gap between two academic years (summer break with no year)
     CALENDAR_DAYS  every day, the gap included */
export const FINE_DAY_BASES = ["ACADEMIC_DAYS", "CALENDAR_DAYS"];

export const DEFAULT_POLICY = Object.freeze({
  /* Borrowing is blocked while outstanding fines are above the school's own limit (D-65:
     each school sets the amount; until it does, fines do not block) */
  blockOnFines: true,
  fineBlockThreshold: null,
  blockOnOverdue: true,
  /* Which days a late fine counts (FINE_DAY_BASES) */
  fineDayBasis: "ACADEMIC_DAYS",
  /* A late fine never exceeds the copy's price */
  capFineAtPrice: true,
  /* Lost copy: max(price + processing fee, minimum charge) */
  lostProcessingFee: 0,
  lostMinimumCharge: 0,
  lostIncludesLateFine: true,
  /* A lost copy returned within this many days has its replacement charge reversed (0: never) */
  lostFoundRefundDays: 30,
  holdPickupDays: 3,
  maxHoldsPerBorrower: 5,
  /* Reminder this many days before the due date (0: none) */
  dueSoonDays: 2,
  /* Overdue reminders on the first late day, then every N days */
  overdueReminderEveryDays: 7,
  /* Parents of student borrowers hear about overdue books and fines */
  notifyParents: true
});

/* Circulation rules created with the policy: students, and everyone else */
export const DEFAULT_RULES = Object.freeze([
  { borrowerRole: ROLES.STUDENT, loanDays: 14, maxLoans: 3, maxRenewals: 2, finePerDay: 2, fineGraceDays: 0 },
  { borrowerRole: null, loanDays: 30, maxLoans: 10, maxRenewals: 2, finePerDay: 2, fineGraceDays: 0 }
]);

/* A copy's own status follows the condition it comes back in (OK copies may go to a hold) */
export const COPY_STATUS_ON_RETURN = Object.freeze({ OK: "AVAILABLE", DAMAGED: "DAMAGED", LOST: "LOST" });

/* "Media", "Periodical" for messages */
export const ITEM_TYPE_LABELS = Object.freeze({
  BOOK: "books",
  REFERENCE: "reference items",
  PERIODICAL: "periodicals",
  MEDIA: "media"
});
