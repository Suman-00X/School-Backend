/* Message wording in one place (English). For other languages, add a locale
   map here and pick it from the school's settings. */

const money = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);

export const messages = {
  attendanceAbsent: ({ studentName, date, schoolName }) => ({
    title: `${studentName} was absent today`,
    body: `${studentName} was marked absent on ${date}. Please contact the school if this is unexpected.`,
    sms: `${schoolName}: ${studentName} was marked absent on ${date}.`
  }),

  resultsPublished: ({ examName }) => ({
    title: `${examName} results are out`,
    body: `Results for ${examName} have been published. Open the report card to see the marks.`,
    sms: `${examName} results are published. Check the school app for the report card.`
  }),

  invoiceIssued: ({ studentName, invoiceNumber, total, dueDate, currency }) => ({
    title: `New fee invoice ${invoiceNumber}`,
    body: `An invoice of ${money(total, currency)} for ${studentName} is due on ${dueDate}.`,
    sms: `Fee invoice ${invoiceNumber} of ${money(total, currency)} for ${studentName} is due on ${dueDate}.`
  }),

  paymentReceived: ({ studentName, amount, receiptNumber, currency }) => ({
    title: `Payment received (${receiptNumber})`,
    body: `We received ${money(amount, currency)} towards ${studentName}'s fees. Receipt ${receiptNumber}.`,
    sms: `Received ${money(amount, currency)} for ${studentName}. Receipt ${receiptNumber}. Thank you.`
  }),

  feeReminder: ({ studentName, invoiceNumber, balance, dueDate, overdue, currency }) => ({
    title: overdue ? `Fee overdue: ${invoiceNumber}` : `Fee due soon: ${invoiceNumber}`,
    body: overdue
      ? `${money(balance, currency)} for ${studentName} was due on ${dueDate} and is overdue. Late fees may apply.`
      : `${money(balance, currency)} for ${studentName} is due on ${dueDate}.`,
    sms: `${overdue ? "Overdue" : "Due"}: ${money(balance, currency)} for ${studentName} (${invoiceNumber}), due ${dueDate}.`
  }),

  importCompleted: ({ succeeded, failed }) => ({
    title: "Student import finished",
    body: `${succeeded} student(s) admitted, ${failed} row(s) need attention. Open the import to see the report.`
  })
};
