/* Delivery channels. IN_APP is always stored; EMAIL/SMS are delivered by jobs. */
export const CHANNELS = ["IN_APP", "EMAIL", "SMS"];
export const DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"];

export const NOTIFICATION_TYPES = [
  "ANNOUNCEMENT",
  "MESSAGE",
  "ATTENDANCE_ABSENT",
  /* Teachers: registers they answer for were not taken that day */
  "ATTENDANCE_MISSED",
  "RESULTS_PUBLISHED",
  "INVOICE_ISSUED",
  "PAYMENT_RECEIVED",
  "REFUND_PROCESSED",
  /* Staff: a refund waits for approval (administrators), or was approved or rejected (its requester) */
  "REFUND_REQUESTED",
  "REFUND_APPROVED",
  "REFUND_REJECTED",
  "FEE_REMINDER",
  "IMPORT_COMPLETED",
  /* Teachers: asked to cover an absent teacher's lesson, or no longer */
  "SUBSTITUTION"
];

export const ANNOUNCEMENT_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED"];
export const AUDIENCE_ROLES = ["ADMIN", "PRINCIPAL", "ACCOUNTANT", "STAFF", "TEACHER", "STUDENT", "PARENT"];

/* Recipients per fan-out batch */
export const FANOUT_BATCH = 500;
