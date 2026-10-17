/* Enum values used by the finance module's tables and validators (single source) */
export const CONCESSION_TYPES = ["PERCENT", "FIXED"];
/* Why a concession is given (reports group by it) */
export const CONCESSION_CATEGORIES = ["SIBLING", "STAFF_WARD", "MERIT", "SCHOLARSHIP", "FINANCIAL_AID", "OTHER"];
/* FIXED: the slab's amount is the fee. PER_DAY: the amount is added for each day in the slab */
export const LATE_FEE_CHARGE_TYPES = ["FIXED", "PER_DAY"];
export const INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"];
/* Invoices that still expect money */
export const OPEN_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID"];
export const PAYMENT_METHODS = ["CASH", "CHEQUE", "UPI", "CARD", "BANK_TRANSFER", "ONLINE"];
export const OFFLINE_PAYMENT_METHODS = ["CASH", "CHEQUE", "UPI", "CARD", "BANK_TRANSFER"];
export const PAYMENT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"];
/* Student credit ledger: money kept from an overpayment, used on an invoice, paid back,
   or put back because a gateway refund failed */
export const CREDIT_ENTRY_TYPES = ["OVERPAYMENT", "APPLIED", "REFUNDED", "REFUND_REVERSED"];
/* Refunds: ORIGINAL = back through the gateway to the payer's card/UPI/bank */
export const REFUND_METHODS = ["ORIGINAL", "CASH", "CHEQUE", "UPI", "BANK_TRANSFER"];
/* REQUESTED: waiting for an administrator (no money has moved); REJECTED: declined.
   Approval executes it: PROCESSED, or PENDING while the gateway completes it.
   FAILED: the gateway could not pay it out, so it was reversed. */
export const REFUND_STATUSES = ["REQUESTED", "PENDING", "PROCESSED", "FAILED", "REJECTED"];
/* Refunds whose money has left, or is leaving, the school */
export const EXECUTED_REFUND_STATUSES = ["PENDING", "PROCESSED"];
/* STAFF: issued in this system; GATEWAY: issued in the gateway's dashboard and reported by webhook */
export const REFUND_SOURCES = ["STAFF", "GATEWAY"];

/* General ledger (double entry). Normal balance: debit for ASSET and EXPENSE, credit for
   the others; a contra account (concessions) carries the opposite of its type's. */
export const LEDGER_ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
export const DEBIT_NORMAL_TYPES = ["ASSET", "EXPENSE"];

/* Every school's system accounts, created on first use. Keys and codes are stable. */
export const SYSTEM_ACCOUNTS = {
  CASH: { code: "1000", name: "Cash", accountType: "ASSET" },
  BANK: { code: "1010", name: "Bank", accountType: "ASSET" },
  GATEWAY_CLEARING: { code: "1020", name: "Payment gateway clearing", accountType: "ASSET" },
  RECEIVABLES: { code: "1100", name: "Accounts receivable – student fees", accountType: "ASSET" },
  /* The part of a gateway refund the books could not attribute (a refund's `unallocated`) */
  REFUND_SUSPENSE: { code: "1190", name: "Refund suspense (to review)", accountType: "ASSET" },
  STUDENT_CREDIT: { code: "2100", name: "Student credit (advances)", accountType: "LIABILITY" },
  OPENING_BALANCES: { code: "3000", name: "Opening balance equity", accountType: "EQUITY" },
  LATE_FEE_INCOME: { code: "4800", name: "Late-fee income", accountType: "INCOME" },
  CONCESSIONS: { code: "4900", name: "Concessions (contra-income)", accountType: "INCOME", isContra: true },
  GATEWAY_CHARGES: { code: "5800", name: "Payment gateway charges", accountType: "EXPENSE" }
};
/* One income account per fee head (system key FEE_INCOME), numbered 4101, 4102… */
export const FEE_INCOME_KEY = "FEE_INCOME";
export const FEE_INCOME_CODE_PREFIX = "41";
/* Kept by their sub-ledgers (invoices, student credit), so no manual journal entries */
export const CONTROL_ACCOUNT_KEYS = ["RECEIVABLES", "STUDENT_CREDIT"];
/* The account money moves through, by payment or refund method */
export const METHOD_ACCOUNT_KEYS = {
  CASH: "CASH",
  CHEQUE: "BANK",
  UPI: "BANK",
  CARD: "BANK",
  BANK_TRANSFER: "BANK",
  ONLINE: "GATEWAY_CLEARING",
  ORIGINAL: "GATEWAY_CLEARING"
};
/* What a journal entry came from. Other modules add their own (LIBRARY_FINE, PAYROLL_RUN…). */
export const JOURNAL_SOURCES = {
  INVOICE: "INVOICE",
  PAYMENT: "PAYMENT",
  REFUND: "REFUND",
  STUDENT_CREDIT: "STUDENT_CREDIT",
  SETTLEMENT: "SETTLEMENT",
  MANUAL: "MANUAL"
};

/* Gateways a school can bring its own keys for (BYOK) */
export const GATEWAY_PROVIDERS = ["razorpay"];
/* Smallest online payment in the school's currency, unless the payer clears the whole balance (D-21) */
export const MIN_ONLINE_PAYMENT = 100;
