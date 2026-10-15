/* Enum values used by the finance module's tables and validators (single source) */
export const LATE_FEE_TYPES = ["NONE", "FIXED", "PER_DAY"];
export const CONCESSION_TYPES = ["PERCENT", "FIXED"];
export const INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"];
/* Invoices that still expect money */
export const OPEN_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID"];
export const PAYMENT_METHODS = ["CASH", "CHEQUE", "UPI", "CARD", "BANK_TRANSFER", "ONLINE"];
export const OFFLINE_PAYMENT_METHODS = ["CASH", "CHEQUE", "UPI", "CARD", "BANK_TRANSFER"];
export const PAYMENT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"];
