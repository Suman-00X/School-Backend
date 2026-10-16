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

  /* credit: the part that was more than the invoice's balance, kept for later fees */
  paymentReceived: ({ studentName, amount, receiptNumber, credit = 0, currency }) => ({
    title: `Payment received (${receiptNumber})`,
    body:
      `We received ${money(amount, currency)} towards ${studentName}'s fees. Receipt ${receiptNumber}.` +
      (credit > 0
        ? ` ${money(credit, currency)} of it was more than the balance and is kept as credit for later fees.`
        : ""),
    sms: `Received ${money(amount, currency)} for ${studentName}. Receipt ${receiptNumber}. Thank you.`
  }),

  feeReminder: ({ studentName, invoiceNumber, balance, dueDate, overdue, currency }) => ({
    title: overdue ? `Fee overdue: ${invoiceNumber}` : `Fee due soon: ${invoiceNumber}`,
    body: overdue
      ? `${money(balance, currency)} for ${studentName} was due on ${dueDate} and is overdue. Late fees may apply.`
      : `${money(balance, currency)} for ${studentName} is due on ${dueDate}.`,
    sms: `${overdue ? "Overdue" : "Due"}: ${money(balance, currency)} for ${studentName} (${invoiceNumber}), due ${dueDate}.`
  }),

  homeworkAssigned: ({ subjectName, title, dueDate }) => ({
    title: `New ${subjectName} homework: ${title}`,
    body: `${title} is due on ${dueDate}. Open the app to see the details and attachments.`
  }),

  homeworkGraded: ({ title, status, marksAwarded, maxMarks }) => ({
    title: status === "RETURNED" ? `Homework returned: ${title}` : `Homework graded: ${title}`,
    body:
      status === "RETURNED"
        ? `Your teacher returned "${title}" for changes. Please resubmit.`
        : `"${title}" has been graded${marksAwarded !== null && marksAwarded !== undefined ? `: ${marksAwarded}/${maxMarks}` : ""}.`
  }),

  lowStock: ({ itemName, stockOnHand, reorderLevel, unit }) => ({
    title: `Low stock: ${itemName}`,
    body: `Only ${stockOnHand} ${unit} of ${itemName} left (reorder level ${reorderLevel}). Time to restock.`
  }),

  importCompleted: ({ succeeded, failed }) => ({
    title: "Student import finished",
    body: `${succeeded} student(s) admitted, ${failed} row(s) need attention. Open the import to see the report.`
  })
};
