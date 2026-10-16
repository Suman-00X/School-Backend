import { formatAmount } from "./circulation.util.js";

/* Library messages (in-app and email). `key` makes each one go out once. */

export const holdReadyNotice = ({ hold, title, accessionNumber }) => ({
  key: `hold-ready:${hold.id}:${hold.readyOn}`,
  userIds: [hold.borrowerUserId],
  title: `Library hold ready: ${title}`,
  body:
    `${title} (${accessionNumber}) is waiting for you at the library desk. ` +
    `Please collect it by ${hold.pickupBy}; after that it goes to the next reader.`,
  data: { kind: "LIBRARY_HOLD_READY", holdId: hold.id, bookId: hold.bookId, copyId: hold.copyId }
});

export const fineChargedNotice = ({ loan, title, accessionNumber, charged, outstanding, userIds, reason }) => ({
  key: `fine-charged:${loan.id}:${reason}`,
  userIds,
  title: `Library fine: ${title}`,
  body:
    `A library charge of ${formatAmount(charged)} was recorded for ${title} (${accessionNumber}): ${reason.toLowerCase()}. ` +
    `Outstanding: ${formatAmount(outstanding)}.`,
  data: { kind: "LIBRARY_FINE_CHARGED", loanId: loan.id, bookId: loan.bookId }
});

export const dueSoonNotice = ({ loan, title, accessionNumber, days }) => ({
  key: `due-soon:${loan.id}:${loan.dueDate}`,
  userIds: [loan.borrowerUserId],
  title: `Library book due soon: ${title}`,
  body:
    `${title} (${accessionNumber}) is due back on ${loan.dueDate}, in ${days} day(s). ` +
    "Return or renew it to avoid a late fine.",
  data: { kind: "LIBRARY_DUE_SOON", loanId: loan.id, bookId: loan.bookId, dueDate: loan.dueDate }
});

export const overdueNotice = ({ loan, title, accessionNumber, days, fine, borrowerName, userIds, period }) => ({
  key: `overdue:${loan.id}:${loan.dueDate}:${period}`,
  userIds,
  title: `Library book overdue: ${title}`,
  body:
    `${title} (${accessionNumber}), borrowed by ${borrowerName}, was due on ${loan.dueDate} and is ${days} day(s) overdue. ` +
    `Please return it to the library.${fine > 0 ? ` Fine so far: ${formatAmount(fine)}.` : ""}`,
  data: { kind: "LIBRARY_OVERDUE", loanId: loan.id, bookId: loan.bookId, copyId: loan.copyId, daysOverdue: days }
});
