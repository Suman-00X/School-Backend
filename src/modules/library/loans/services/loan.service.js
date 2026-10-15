import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays } from "../../../../common/utils/date.util.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { copyService } from "../../copies/index.js";
import { libraryPolicyService } from "../../policy/index.js";
import { BORROWER_ROLES, COPY_STATUS_ON_RETURN } from "../../shared/constants/library.constants.js";
import { nextFineReceiptNumber } from "../../shared/utils/codes.util.js";
import {
  daysLate,
  formatAmount,
  fullName,
  lateFineFor,
  loanDaysFor,
  maxActiveLoansFor
} from "../../shared/utils/circulation.util.js";
import { libraryFinePayments, libraryLoans } from "../models/loan.schema.js";
import { finePaymentRepository, loanRepository } from "../repositories/loan.repository.js";

/* The furthest ahead a librarian may set a due date by hand */
const MAX_LOAN_DAYS = 365;

const withDetails = {
  copy: { columns: { id: true, accessionNumber: true, barcode: true, status: true } },
  book: { columns: { id: true, title: true, authors: true, isbn: true } },
  borrower: { columns: { id: true, firstName: true, lastName: true, role: true } }
};

/* API view of a loan: totals, overdue state and the fine accrued so far on an open loan */
const present = (loan, today, policy) => {
  const isOpen = loan.status === "ISSUED";
  const overdueDays = isOpen ? daysLate(loan.dueDate, today) : 0;
  return {
    ...loan,
    borrower: loan.borrower && { ...loan.borrower, name: fullName(loan.borrower) },
    fineTotal: fromMinor(toMinor(loan.lateFine) + toMinor(loan.lostCharge)),
    isOverdue: overdueDays > 0,
    daysOverdue: overdueDays,
    /* What the late fine would be if the book came back today (assessed on return) */
    fineAccrued: isOpen ? lateFineFor(policy, loan.dueDate, today) : 0
  };
};

const presentAll = async (ctx, result) => {
  const [today, policy] = await Promise.all([tenantToday(ctx.tenantId), libraryPolicyService.get(ctx)]);
  return { ...result, rows: result.rows.map(loan => present(loan, today, policy)) };
};

const listConditions = ({ status, borrowerUserId, bookId, copyId, overdue, withFine }, today) =>
  [
    status && eq(libraryLoans.status, status),
    borrowerUserId && eq(libraryLoans.borrowerUserId, borrowerUserId),
    bookId && eq(libraryLoans.bookId, bookId),
    copyId && eq(libraryLoans.copyId, copyId),
    overdue === true && and(eq(libraryLoans.status, "ISSUED"), lt(libraryLoans.dueDate, today)),
    withFine === true && gt(libraryLoans.fineOutstanding, 0)
  ].filter(Boolean);

/* An active account that may borrow (students and employees) */
const borrowerFor = async (ctx, borrowerUserId) => {
  const [borrower] = await accountService.findManyByIds(ctx, [borrowerUserId]);
  if (!borrower) throw unprocessable("borrowerUserId does not refer to an active account");
  if (borrower.status !== "ACTIVE") {
    throw unprocessable(`${fullName(borrower)}'s account is ${borrower.status.toLowerCase()}; it cannot borrow books`);
  }
  if (!BORROWER_ROLES.includes(borrower.role)) {
    throw unprocessable("Parents cannot borrow books; issue them to the student instead");
  }
  return borrower;
};

const lockCopy = async (ctx, { copyId, accessionNumber }, dbc) => {
  const copy = copyId
    ? await copyService.lockById(ctx, copyId, { dbc })
    : await copyService.lockByAccessionNumber(ctx, accessionNumber, { dbc });
  if (!copy) {
    throw unprocessable(
      copyId ? "copyId does not refer to an existing copy" : `No copy has accession number ${accessionNumber}`
    );
  }
  if (copy.status === "ISSUED") throw conflict(`Copy ${copy.accessionNumber} is already on loan`);
  if (copy.status !== "AVAILABLE") {
    throw unprocessable(`Copy ${copy.accessionNumber} is ${copy.status.toLowerCase()} and cannot be issued`);
  }
  return copy;
};

const lockLoan = async (ctx, loanId, dbc) => {
  const loan = await loanRepository.lockForUpdate(ctx.tenantId, loanId, { dbc });
  if (!loan) throw notFound("Loan");
  return loan;
};

/* Fines are settled once assessed, i.e. after the return */
const assertFineSettleable = loan => {
  if (loan.status === "ISSUED") {
    throw unprocessable("The fine is assessed when the book is returned; record the return first");
  }
  if (toMinor(loan.fineOutstanding) <= 0) throw unprocessable("This loan has no outstanding fine");
};

/* User accounts whose loans the signed-in person may see in "my loans" */
const visibleBorrowerIds = async ctx => {
  if (ctx.role !== ROLES.PARENT) return [ctx.userId];
  const parent = await parentService.findByUserId(ctx, ctx.userId);
  if (!parent) return [];
  const links = await studentParentService.childrenOf(ctx, parent.id);
  const children = await studentService.findManyByIds(
    ctx,
    links.map(link => link.studentId)
  );
  return children.map(child => child.userId);
};

export const loanService = {
  issue: async (ctx, { copyId, accessionNumber, borrowerUserId, dueDate }) => {
    const today = await tenantToday(ctx.tenantId);
    const borrower = await borrowerFor(ctx, borrowerUserId);
    if (dueDate && dueDate > addDays(today, MAX_LOAN_DAYS)) {
      throw unprocessable(`dueDate must be within ${MAX_LOAN_DAYS} days of today`);
    }

    const loanId = await transaction(async tx => {
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      /* Borrower first, then the copy: one lock order for every issue */
      await loanRepository.lockBorrower(ctx.tenantId, borrowerUserId, { dbc: tx });
      const copy = await lockCopy(ctx, { copyId, accessionNumber }, tx);

      const limit = maxActiveLoansFor(policy, borrower.role);
      const active = await loanRepository.countOpenForBorrower(ctx.tenantId, borrowerUserId, { dbc: tx });
      if (active >= limit) {
        const who = borrower.role === ROLES.STUDENT ? "students" : "staff";
        throw unprocessable(
          `${fullName(borrower)} already has ${active} book(s) on loan, the limit for ${who} is ${limit}`
        );
      }
      if (await loanRepository.hasOpenLoanOfBook(ctx.tenantId, borrowerUserId, copy.bookId, { dbc: tx })) {
        throw unprocessable(`${fullName(borrower)} already has a copy of this book on loan`);
      }

      const loan = await loanRepository.create(
        ctx.tenantId,
        {
          copyId: copy.id,
          bookId: copy.bookId,
          borrowerUserId,
          borrowerRole: borrower.role,
          issuedOn: today,
          dueDate: dueDate ?? addDays(today, loanDaysFor(policy, borrower.role)),
          issuedBy: ctx.userId
        },
        { dbc: tx }
      );
      await copyService.setStatus(ctx, copy.id, "ISSUED", { dbc: tx });
      return loan.id;
    });
    return loanService.getById(ctx, loanId);
  },

  /* condition OK -> copy back on the shelf; DAMAGED -> copy DAMAGED; LOST -> copy LOST
     and its price is added to the fine. The late fine applies in every case. */
  returnLoan: async (ctx, loanId, { condition, notes }) => {
    const today = await tenantToday(ctx.tenantId);
    await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      if (loan.status !== "ISSUED") throw conflict(`This loan was already closed on ${loan.returnedOn}`);
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      const copy = await copyService.lockById(ctx, loan.copyId, { dbc: tx });

      await loanRepository.update(
        ctx.tenantId,
        loanId,
        {
          status: condition === "LOST" ? "LOST" : "RETURNED",
          returnedOn: today,
          returnCondition: condition,
          returnNotes: notes,
          lateFine: lateFineFor(policy, loan.dueDate, today),
          lostCharge: condition === "LOST" ? (copy?.price ?? 0) : 0,
          returnedTo: ctx.userId
        },
        { dbc: tx }
      );
      if (copy) await copyService.setStatus(ctx, copy.id, COPY_STATUS_ON_RETURN[condition], { dbc: tx });
    });
    return loanService.getById(ctx, loanId);
  },

  /* New due date = today + the loan period; not when overdue or out of renewals */
  renew: async (ctx, loanId) => {
    const today = await tenantToday(ctx.tenantId);
    await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      if (loan.status !== "ISSUED") throw unprocessable("Only a book that is on loan can be renewed");
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      if (loan.dueDate < today) {
        throw unprocessable(`This loan is overdue (due ${loan.dueDate}); the book must be returned, not renewed`);
      }
      if (loan.renewalCount >= policy.maxRenewals) {
        throw unprocessable(
          `This loan has already been renewed ${loan.renewalCount} time(s), the most the library allows`
        );
      }
      const dueDate = addDays(today, loanDaysFor(policy, loan.borrowerRole));
      if (dueDate <= loan.dueDate) {
        throw unprocessable(`Renewing today would not extend the due date (${loan.dueDate})`);
      }
      await loanRepository.update(ctx.tenantId, loanId, { dueDate, renewalCount: loan.renewalCount + 1 }, { dbc: tx });
    });
    return loanService.getById(ctx, loanId);
  },

  /* Part or all of the outstanding fine, with a receipt */
  payFine: async (ctx, loanId, { amount, method, reference }) => {
    const paymentId = await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      assertFineSettleable(loan);
      if (toMinor(amount) > toMinor(loan.fineOutstanding)) {
        throw unprocessable(`The amount exceeds the outstanding fine of ${formatAmount(loan.fineOutstanding)}`);
      }
      const payment = await finePaymentRepository.create(
        ctx.tenantId,
        {
          loanId,
          amount,
          method,
          reference,
          receiptNumber: await nextFineReceiptNumber(ctx.tenantId, { dbc: tx }),
          receivedBy: ctx.userId
        },
        { dbc: tx }
      );
      await loanRepository.update(
        ctx.tenantId,
        loanId,
        { finePaid: fromMinor(toMinor(loan.finePaid) + toMinor(amount)) },
        { dbc: tx }
      );
      return payment.id;
    });
    const payment = await finePaymentRepository.findById(ctx.tenantId, paymentId);
    return { ...payment, loan: await loanService.getById(ctx, loanId) };
  },

  /* Waives everything still outstanding */
  waiveFine: async (ctx, loanId, { reason }) => {
    await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      assertFineSettleable(loan);
      await loanRepository.update(
        ctx.tenantId,
        loanId,
        {
          fineWaived: fromMinor(toMinor(loan.fineWaived) + toMinor(loan.fineOutstanding)),
          waiverReason: reason,
          waivedBy: ctx.userId,
          waivedAt: new Date()
        },
        { dbc: tx }
      );
    });
    return loanService.getById(ctx, loanId);
  },

  list: async (ctx, { page, limit, ...filters }) => {
    const today = await tenantToday(ctx.tenantId);
    return presentAll(
      ctx,
      await loanRepository.list(ctx.tenantId, {
        page,
        limit,
        with: withDetails,
        conditions: listConditions(filters, today)
      })
    );
  },

  getById: async (ctx, loanId) => {
    const loan = await loanRepository.findById(ctx.tenantId, loanId, {
      with: { ...withDetails, payments: { orderBy: desc(libraryFinePayments.paidAt) } }
    });
    if (!loan) throw notFound("Loan");
    const [today, policy] = await Promise.all([tenantToday(ctx.tenantId), libraryPolicyService.get(ctx)]);
    return present(loan, today, policy);
  },

  /* The signed-in person's loans; a parent sees their children's */
  myLoans: async (ctx, { page, limit, ...filters }) => {
    const borrowerIds = await visibleBorrowerIds(ctx);
    if (!borrowerIds.length) return { rows: [], meta: buildPageMeta(page, limit, 0) };
    const today = await tenantToday(ctx.tenantId);
    return presentAll(
      ctx,
      await loanRepository.list(ctx.tenantId, {
        page,
        limit,
        with: withDetails,
        conditions: [inArray(libraryLoans.borrowerUserId, borrowerIds), ...listConditions(filters, today)]
      })
    );
  }
};
