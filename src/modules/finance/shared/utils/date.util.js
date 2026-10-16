/* The calendar date of an instant in a time zone: dateIn("Asia/Kolkata", payment.paidAt) -> "2026-10-16" */
export const dateIn = (timeZone = "UTC", instant = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant)
  );
