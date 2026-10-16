/* Delivery channels. IN_APP is always stored; EMAIL/SMS are delivered by jobs. */
export const CHANNELS = ["IN_APP", "EMAIL", "SMS"];
export const DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"];

export const NOTIFICATION_TYPES = [
  "ANNOUNCEMENT",
  "MESSAGE",
  "ATTENDANCE_ABSENT",
  "RESULTS_PUBLISHED",
  "INVOICE_ISSUED",
  "PAYMENT_RECEIVED",
  "REFUND_PROCESSED",
  "FEE_REMINDER",
  "IMPORT_COMPLETED"
];

export const ANNOUNCEMENT_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED"];
export const AUDIENCE_ROLES = ["ADMIN", "PRINCIPAL", "ACCOUNTANT", "STAFF", "TEACHER", "STUDENT", "PARENT"];

/* Recipients per fan-out batch */
export const FANOUT_BATCH = 500;
