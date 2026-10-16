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
/* Student credit ledger: money kept from an overpayment, used on an invoice, or paid back */
export const CREDIT_ENTRY_TYPES = ["OVERPAYMENT", "APPLIED", "REFUNDED"];
/* Gateways a school can bring its own keys for (BYOK) */
export const GATEWAY_PROVIDERS = ["razorpay"];
/* Smallest online payment in the school's currency, unless the payer clears the whole balance (D-21) */
export const MIN_ONLINE_PAYMENT = 100;
