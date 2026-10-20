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

  /* Two-session attendance: one alert per session missed */
  attendanceAbsentSession: ({ studentName, date, session, schoolName }) => ({
    title: `${studentName} was absent in the ${session} session`,
    body: `${studentName} was marked absent in the ${session} session on ${date}. Please contact the school if this is unexpected.`,
    sms: `${schoolName}: ${studentName} was marked absent in the ${session} session on ${date}.`
  }),

  /* Period-wise attendance: one alert per day, on the first absence */
  attendanceAbsentPeriods: ({ studentName, date, periods, schoolName }) => ({
    title: `${studentName} missed ${periods.length === 1 ? "a class" : `${periods.length} classes`} today`,
    body: `${studentName} was marked absent in ${periods.join(", ")} on ${date}. Please contact the school if this is unexpected.`,
    sms: `${schoolName}: ${studentName} was marked absent in ${periods.join(", ")} on ${date}.`
  }),

  /* To a teacher, in the evening: registers of the day they answer for that nobody took */
  registersMissed: ({ date, registers }) => ({
    title: `${registers.length === 1 ? "1 attendance register was" : `${registers.length} attendance registers were`} not taken on ${date}`,
    body: `Nobody took ${registers.length === 1 ? "this register" : "these registers"} you are responsible for on ${date}: ${registers.join(", ")}. Please take ${registers.length === 1 ? "it" : "them"} while the register is still open.`
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
  refundProcessed: ({ studentName, amount, refundNumber, receiptNumber, toOriginal, currency }) => ({
    title: `Refund processed (${refundNumber})`,
    body:
      (receiptNumber
        ? `${money(amount, currency)} from payment ${receiptNumber} for ${studentName}'s fees has been refunded (${refundNumber}).`
        : `${money(amount, currency)} of ${studentName}'s fee credit has been paid back (${refundNumber}).`) +
      (toOriginal
        ? " It goes back to the card, UPI or bank account that paid; banks usually take 5–7 working days."
        : "")
  }),

  /* To administrators: someone asked to pay money back */
  refundRequested: ({ amount, receiptNumber, studentName, requesterName, reason, currency }) => ({
    title: `A refund of ${money(amount, currency)} needs your approval`,
    body:
      `${requesterName} asked to refund ${money(amount, currency)} ${receiptNumber ? `of payment ${receiptNumber}` : "of the credit"} for ${studentName}` +
      `${reason ? `: "${reason}"` : ""}. Approve or reject it under Finance > Refunds. No money moves until you approve.`
  }),

  /* To the person who asked */
  refundDecided: ({ refundNumber, amount, approved, pending, deciderName, reason, currency }) => ({
    title: approved ? `Refund ${refundNumber} approved` : `Refund request of ${money(amount, currency)} rejected`,
    body: approved
      ? `${deciderName} approved refund ${refundNumber} of ${money(amount, currency)}. ` +
        (pending ? "The payment gateway is completing it." : "It has been paid back.")
      : `${deciderName} rejected your refund request of ${money(amount, currency)}: ${reason}. No money was paid back.`
  }),

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

  substitutionAssigned: ({ date, periodName, startTime, sectionName, absentTeacher, what }) => ({
    title: `Substitution: ${periodName} of ${sectionName} on ${date}`,
    body: `Please take ${periodName} (${startTime.slice(0, 5)}) of ${sectionName} on ${date}: ${what}, in place of ${absentTeacher}.`
  }),

  substitutionCancelled: ({ date, periodName, sectionName }) => ({
    title: `Substitution cancelled: ${periodName} of ${sectionName} on ${date}`,
    body: `You no longer need to take ${periodName} of ${sectionName} on ${date}.`
  }),

  importCompleted: ({ succeeded, failed }) => ({
    title: "Student import finished",
    body: `${succeeded} student(s) admitted, ${failed} row(s) need attention. Open the import to see the report.`
  })
};
