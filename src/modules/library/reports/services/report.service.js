import { ROLES } from "../../../../common/auth/roles.js";
import { sum } from "../../../../common/money/money.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { loanService } from "../../loans/index.js";
import { BORROWER_ROLES } from "../../shared/constants/library.constants.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { fullName } from "../../shared/utils/circulation.util.js";
import { reportQueries } from "../repositories/report.queries.js";

/* Each report returns { data, table }: data for JSON, table ({ rows, columns, fileName, title }) for sendTable() */

const timeZoneOf = async ctx => (await getTenant(ctx.tenantId))?.timezone ?? "UTC";

/* Names and (for students) classes of the people in a report */
const peopleOf = async (ctx, userIds) => {
  const [accounts, classes] = await Promise.all([
    accountService.findManyByIds(ctx, [...new Set(userIds)]),
    borrowers.classNames(ctx)
  ]);
  const people = new Map(accounts.map(user => [user.id, { name: fullName(user), role: user.role }]));
  return userId => ({ ...(people.get(userId) ?? { name: "", role: "" }), className: classes.get(userId) ?? "" });
};

const loanRow = person => loan => ({
  loanId: loan.id,
  title: loan.book.title,
  accessionNumber: loan.copy.accessionNumber,
  borrower: loan.borrower.name,
  role: loan.borrower.role,
  className: person(loan.borrowerUserId).className,
  issuedOn: loan.issuedOn,
  dueDate: loan.dueDate,
  daysOverdue: loan.daysOverdue,
  renewals: loan.renewalCount,
  lateFine: loan.lateFine,
  fineOutstanding: loan.fineOutstanding
});

const loanColumns = [
  { key: "title", header: "Title", width: 30 },
  { key: "accessionNumber", header: "Accession no.", width: 14 },
  { key: "borrower", header: "Borrower", width: 24 },
  { key: "role", header: "Role" },
  { key: "className", header: "Class" },
  { key: "issuedOn", header: "Issued on" },
  { key: "dueDate", header: "Due" },
  { key: "daysOverdue", header: "Days overdue", width: 14 },
  { key: "lateFine", header: "Late fine so far", width: 16 },
  { key: "fineOutstanding", header: "Outstanding", width: 14 }
];

export const reportService = {
  currentLoans: async ctx => {
    const today = await tenantToday(ctx.tenantId);
    const loans = await loanService.findOpen(ctx);
    const person = await peopleOf(
      ctx,
      loans.map(loan => loan.borrowerUserId)
    );
    const items = loans.map(loanRow(person));
    return {
      data: { asOf: today, count: items.length, overdue: items.filter(i => i.daysOverdue > 0).length, loans: items },
      table: {
        fileName: `library-loans-${today}`,
        title: `Books on loan as of ${today}`,
        rows: items,
        columns: loanColumns
      }
    };
  },

  overdue: async ctx => {
    const today = await tenantToday(ctx.tenantId);
    const loans = await loanService.findOpen(ctx, { overdueOnly: true });
    const person = await peopleOf(
      ctx,
      loans.map(loan => loan.borrowerUserId)
    );
    const items = loans.map(loanRow(person)).sort((a, b) => b.daysOverdue - a.daysOverdue);
    return {
      data: { asOf: today, count: items.length, finesAccrued: sum(items.map(i => i.lateFine)), loans: items },
      table: {
        fileName: `library-overdue-${today}`,
        title: `Overdue books as of ${today}`,
        rows: items,
        columns: loanColumns
      }
    };
  },

  finesCollected: async (ctx, { from, to }) => {
    const timeZone = await timeZoneOf(ctx);
    const [payments, waivers] = await Promise.all([
      reportQueries.finePayments(ctx.tenantId, from, to, timeZone),
      reportQueries.waiverTotal(ctx.tenantId, from, to, timeZone)
    ]);
    const person = await peopleOf(
      ctx,
      payments.map(p => p.borrowerUserId)
    );
    const items = payments.map(p => ({
      ...p,
      borrower: person(p.borrowerUserId).name,
      className: person(p.borrowerUserId).className
    }));
    const byMethod = {};
    for (const p of items) byMethod[p.method] = sum([byMethod[p.method] ?? 0, p.amount]);
    /* Library credit moves money already received; it is not new cash */
    const collected = sum(items.filter(p => p.method !== "LIBRARY_CREDIT").map(p => p.amount));
    return {
      data: { from, to, collected, byMethod, waived: waivers.total, waivers: waivers.count, payments: items },
      table: {
        fileName: `library-fines-collected-${from}-to-${to}`,
        title: `Library fines collected ${from} to ${to}`,
        rows: items,
        columns: [
          { key: "paidOn", header: "Date" },
          { key: "receiptNumber", header: "Receipt", width: 14 },
          { key: "borrower", header: "Borrower", width: 24 },
          { key: "className", header: "Class" },
          { key: "title", header: "Title", width: 30 },
          { key: "accessionNumber", header: "Accession no.", width: 14 },
          { key: "method", header: "Method", width: 16 },
          { key: "amount", header: "Amount" }
        ]
      }
    };
  },

  /* Per borrower, with late fines as of today */
  finesOutstanding: async ctx => {
    const today = await tenantToday(ctx.tenantId);
    const loans = await loanService.findOwing(ctx);
    const person = await peopleOf(
      ctx,
      loans.map(loan => loan.borrowerUserId)
    );
    const byBorrower = new Map();
    for (const loan of loans) {
      const entry = byBorrower.get(loan.borrowerUserId) ?? {
        borrowerUserId: loan.borrowerUserId,
        borrower: loan.borrower.name,
        role: loan.borrower.role,
        className: person(loan.borrowerUserId).className,
        loans: 0,
        outstanding: 0
      };
      entry.loans += 1;
      entry.outstanding = sum([entry.outstanding, loan.fineOutstanding]);
      byBorrower.set(loan.borrowerUserId, entry);
    }
    const items = [...byBorrower.values()].sort((a, b) => b.outstanding - a.outstanding);
    return {
      data: { asOf: today, total: sum(items.map(i => i.outstanding)), borrowers: items },
      table: {
        fileName: `library-fines-outstanding-${today}`,
        title: `Library fines outstanding as of ${today}`,
        rows: items,
        columns: [
          { key: "borrower", header: "Borrower", width: 24 },
          { key: "role", header: "Role" },
          { key: "className", header: "Class" },
          { key: "loans", header: "Loans" },
          { key: "outstanding", header: "Outstanding", width: 14 }
        ]
      }
    };
  },

  mostBorrowed: async (ctx, { from, to, limit }) => {
    const titles = await reportQueries.mostBorrowed(ctx.tenantId, from, to, limit);
    return {
      data: { from, to, titles },
      table: {
        fileName: `library-most-borrowed-${from}-to-${to}`,
        title: `Most borrowed titles ${from} to ${to}`,
        rows: titles,
        columns: [
          { key: "title", header: "Title", width: 30 },
          { key: "authors", header: "Authors", width: 28 },
          { key: "category", header: "Category", width: 16 },
          { key: "loans", header: "Loans" },
          { key: "borrowers", header: "Borrowers" }
        ]
      }
    };
  },

  /* Borrowers (students and staff) with no loan since a date */
  inactiveBorrowers: async (ctx, { since, role }) => {
    const [accounts, lastLoans, classes] = await Promise.all([
      accountService.findByRoles(ctx, role ? [role] : BORROWER_ROLES),
      reportQueries.lastLoanByBorrower(ctx.tenantId),
      borrowers.classNames(ctx)
    ]);
    const last = new Map(lastLoans.map(row => [row.userId, row]));
    const items = accounts
      .filter(user => user.status === "ACTIVE" && !(last.get(user.id)?.lastIssuedOn >= since))
      .map(user => ({
        userId: user.id,
        name: fullName(user),
        role: user.role,
        className: user.role === ROLES.STUDENT ? (classes.get(user.id) ?? "") : "",
        lastIssuedOn: last.get(user.id)?.lastIssuedOn ?? null,
        loansEver: last.get(user.id)?.loans ?? 0
      }))
      .sort(
        (a, b) => a.role.localeCompare(b.role) || a.className.localeCompare(b.className) || a.name.localeCompare(b.name)
      );
    return {
      data: { since, count: items.length, borrowers: items },
      table: {
        fileName: `library-inactive-since-${since}`,
        title: `Borrowers with no loan since ${since}`,
        rows: items,
        columns: [
          { key: "name", header: "Name", width: 24 },
          { key: "role", header: "Role" },
          { key: "className", header: "Class" },
          { key: "lastIssuedOn", header: "Last loan", width: 14 },
          { key: "loansEver", header: "Loans ever", width: 12 }
        ]
      }
    };
  },

  acquisitions: async (ctx, { from, to }) => {
    const copies = await reportQueries.acquisitions(ctx.tenantId, from, to, await timeZoneOf(ctx));
    return {
      data: { from, to, count: copies.length, totalValue: sum(copies.map(c => c.price ?? 0)), copies },
      table: {
        fileName: `library-acquisitions-${from}-to-${to}`,
        title: `Library acquisitions ${from} to ${to}`,
        rows: copies,
        columns: [
          { key: "acquiredOn", header: "Acquired on", width: 14 },
          { key: "accessionNumber", header: "Accession no.", width: 14 },
          { key: "title", header: "Title", width: 30 },
          { key: "authors", header: "Authors", width: 24 },
          { key: "itemType", header: "Type" },
          { key: "source", header: "Source", width: 20 },
          { key: "price", header: "Price" },
          { key: "status", header: "Status" }
        ]
      }
    };
  }
};
