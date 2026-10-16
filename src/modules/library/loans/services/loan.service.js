import { and, asc, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, daysBetween } from "../../../../common/utils/date.util.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { bookService } from "../../books/index.js";
import { circulationRuleService } from "../../circulation-rules/index.js";
import { copyService } from "../../copies/index.js";
import { holdService } from "../../holds/index.js";
import { libraryPolicyService } from "../../policy/index.js";
import { COPY_STATUS_ON_RETURN } from "../../shared/constants/library.constants.js";
import { sendNotices } from "../../shared/jobs/notice.job.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { libraryCalendar } from "../../shared/services/libraryCalendar.service.js";
import {
  fineCapFor,
  itemTypeOf,
  lostChargeFor,
  outstandingOf,
  plural,
  settle
} from "../../shared/utils/circulation.util.js";
import { lockBorrower } from "../../shared/utils/locks.util.js";
import { fineChargedNotice } from "../../shared/utils/notices.util.js";
import { libraryFinePayments, libraryFineWaivers, libraryLoans } from "../models/loan.schema.js";
import { creditRepository, loanRepository } from "../repositories/loan.repository.js";
import { loanStanding } from "./loanStanding.service.js";
import { loanView } from "./loanView.service.js";

/* The furthest a loan may be back-dated, or a due date set ahead by hand */
const MAX_DAYS = 365;

const withDetails = {
  copy: { columns: { id: true, accessionNumber: true, barcode: true, status: true } },
  book: { columns: { id: true, title: true, authors: true, isbn: true } },
  borrower: { columns: { id: true, firstName: true, lastName: true, role: true } }
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

const presentPage = async (ctx, result, today) => ({
  ...result,
  rows: await loanView.presentAll(ctx, result.rows, today)
});

/* issuedOn defaults to today; a past date records a loan after the fact (with a reason) */
const checkDates = (today, { issuedOn, dueDate, backdateReason }) => {
  if (issuedOn > today) throw unprocessable("issuedOn cannot be in the future");
  if (issuedOn < today && !backdateReason) {
    throw unprocessable("Give a backdateReason when recording a loan issued before today");
  }
  if (issuedOn < addDays(today, -MAX_DAYS)) throw unprocessable(`issuedOn must be within the last ${MAX_DAYS} days`);
  if (!dueDate) return;
  if (dueDate < issuedOn) throw unprocessable(`dueDate cannot be before the issue date (${issuedOn})`);
  if (dueDate < today) throw unprocessable("dueDate cannot be in the past");
  if (dueDate > addDays(issuedOn, MAX_DAYS)) throw unprocessable(`dueDate must be within ${MAX_DAYS} days of issue`);
};

/* The copy by id or accession number, locked after its book (the lock order) */
const lockCopyAndBook = async (ctx, { copyId, accessionNumber }, dbc) => {
  const found = copyId
    ? await copyService.findById(ctx, copyId, { dbc })
    : await copyService.findByCode(ctx, accessionNumber, { dbc });
  if (!found) {
    throw unprocessable(
      copyId ? "copyId does not refer to an existing copy" : `No copy has accession number ${accessionNumber}`
    );
  }
  const book = await bookService.lockForUpdate(ctx, found.bookId, { dbc });
  const copy = await copyService.lockById(ctx, found.id, { dbc });
  return { book, copy };
};

const assertLendable = ({ book, copy }) => {
  if (copy.status === "ISSUED") throw conflict(`Copy ${copy.accessionNumber} is already on loan`);
  if (!["AVAILABLE", "ON_HOLD"].includes(copy.status)) {
    throw unprocessable(`Copy ${copy.accessionNumber} is ${copy.status.toLowerCase()} and cannot be issued`);
  }
  if (itemTypeOf(copy, book) === "REFERENCE") {
    throw unprocessable(`Copy ${copy.accessionNumber} of ${book.title} is for reference; it stays in the library`);
  }
};

/* The rule's loan limit, counted within its item type; and the overall limit */
const checkLimits = async (ctx, borrower, { rule, overall }, dbc) => {
  for (const limitRule of [rule, overall].filter(Boolean)) {
    const active = await loanRepository.countOpenForBorrower(ctx.tenantId, borrower.id, limitRule.itemType, { dbc });
    if (active >= limitRule.maxLoans) {
      const appliesTo = await circulationRuleService.describe(ctx, limitRule);
      throw unprocessable(
        `${borrower.name} already has ${plural(active, "item")} on loan; the limit for ${appliesTo} is ${limitRule.maxLoans}`
      );
    }
  }
};

const lockLoan = async (ctx, loanId, dbc) => {
  const loan = await loanRepository.lockForUpdate(ctx.tenantId, loanId, { dbc });
  if (!loan) throw notFound("Loan");
  return loan;
};

/* After charges change: move any overpayment to library credit */
const applySettlement = async (ctx, loan, { credit }, reason, dbc) => {
  if (toMinor(credit) <= 0) return;
  await creditRepository.create(
    ctx.tenantId,
    { borrowerUserId: loan.borrowerUserId, amount: credit, reason, loanId: loan.id, createdBy: ctx.userId },
    { dbc }
  );
};

/* Borrower and, for a student when the policy says so, their parents */
const fineRecipients = async (ctx, loan, policy) => [
  loan.borrowerUserId,
  ...(loan.borrowerRole === "STUDENT" && policy.notifyParents
    ? await borrowers.parentUserIdsOf(ctx, [loan.borrowerUserId])
    : [])
];

export const loanService = {
  issue: async (ctx, { copyId, accessionNumber, borrowerUserId, dueDate, backdateReason, overrideReason, ...rest }) => {
    const today = await tenantToday(ctx.tenantId);
    const issuedOn = rest.issuedOn ?? today;
    checkDates(today, { issuedOn, dueDate, backdateReason });
    const borrower = await borrowers.forCirculation(ctx, borrowerUserId);
    const notices = [];

    const loanId = await transaction(async tx => {
      /* Borrower, then book, then copy: one lock order for every issue */
      await lockBorrower(ctx.tenantId, borrower.id, { dbc: tx });
      const { book, copy } = await lockCopyAndBook(ctx, { copyId, accessionNumber }, tx);
      assertLendable({ book, copy });
      const hold = await holdService.holdForIssue(ctx, { book, copy, borrower }, { dbc: tx });

      if (issuedOn < today) {
        const lastReturn = await loanRepository.lastReturnOfCopy(ctx.tenantId, copy.id, { dbc: tx });
        if (lastReturn && issuedOn < lastReturn) {
          throw unprocessable(
            `Copy ${copy.accessionNumber} was returned on ${lastReturn}; a loan cannot start before then`
          );
        }
        if (copy.acquiredOn && issuedOn < copy.acquiredOn) {
          throw unprocessable(
            `Copy ${copy.accessionNumber} was acquired on ${copy.acquiredOn}; a loan cannot start before then`
          );
        }
      }

      const itemType = itemTypeOf(copy, book);
      const rules = await circulationRuleService.resolve(ctx, borrower, itemType, { dbc: tx });
      if (!rules.rule) {
        throw unprocessable(
          `No circulation rule covers ${borrower.name} borrowing ${itemType.toLowerCase()} items; add one under circulation rules`
        );
      }
      await checkLimits(ctx, borrower, rules, tx);
      if (await loanRepository.hasOpenLoanOfBook(ctx.tenantId, borrower.id, book.id, { dbc: tx })) {
        throw unprocessable(`${borrower.name} already has a copy of this book on loan`);
      }

      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      const blocks = await loanStanding.blocks(ctx, borrower, { dbc: tx, today, policy });
      if (blocks.length && !overrideReason) {
        throw unprocessable(`${blocks.map(b => b.message).join(". ")}. A librarian may override this with a reason`);
      }

      const { rule } = rules;
      const loan = await loanRepository.create(
        ctx.tenantId,
        {
          copyId: copy.id,
          bookId: book.id,
          borrowerUserId: borrower.id,
          borrowerRole: borrower.role,
          itemType,
          ruleId: rule.id,
          loanDays: rule.loanDays,
          maxRenewals: rule.maxRenewals,
          finePerDay: rule.finePerDay,
          fineGraceDays: rule.fineGraceDays,
          fineCap: fineCapFor(policy, rule, copy.price),
          issuedOn,
          dueDate: await libraryCalendar.nextOpenDay(ctx, dueDate ?? addDays(issuedOn, rule.loanDays)),
          backdateReason: issuedOn < today ? backdateReason : null,
          blockOverrideReason: blocks.length ? overrideReason : null,
          issuedBy: ctx.userId
        },
        { dbc: tx }
      );
      await copyService.setStatus(ctx, copy.id, "ISSUED", { dbc: tx });
      if (hold) await holdService.fulfil(ctx, hold, { book, copy, loanId: loan.id }, { dbc: tx, today, notices });
      return loan.id;
    });
    await sendNotices(ctx, notices);
    return loanService.getById(ctx, loanId);
  },

  /* condition OK -> copy to the next reader waiting, or the shelf; DAMAGED -> copy
     DAMAGED, with an optional damage charge; LOST -> copy LOST and the replacement
     charge. The late fine runs to today (for LOST only when the policy says so)
     and is settled against what was already paid. */
  returnLoan: async (ctx, loanId, { condition, notes, damageCharge }) => {
    if (damageCharge && condition !== "DAMAGED") throw unprocessable("damageCharge applies to a damaged return only");
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      if (loan.status !== "ISSUED") throw conflict(`This loan was already closed on ${loan.returnedOn}`);
      const book = await bookService.lockForUpdate(ctx, loan.bookId, { dbc: tx });
      const copy = await copyService.lockById(ctx, loan.copyId, { dbc: tx });
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      const accrue = await loanView.accrualFor(ctx, [loan], today, { policy, dbc: tx });

      const lost = condition === "LOST";
      const charges = {
        lateFine: lost && !policy.lostIncludesLateFine ? 0 : accrue(loan).lateFine,
        lostCharge: lost ? lostChargeFor(policy, copy?.price) : 0,
        damageCharge: condition === "DAMAGED" ? (damageCharge ?? 0) : 0
      };
      const settlement = settle(loan, charges);
      const closed = await loanRepository.update(
        ctx.tenantId,
        loanId,
        {
          ...settlement.changes,
          status: lost ? "LOST" : "RETURNED",
          returnedOn: today,
          lostOn: lost ? today : null,
          returnCondition: condition,
          returnNotes: notes,
          returnedTo: ctx.userId
        },
        { dbc: tx }
      );
      await applySettlement(ctx, loan, settlement, `Late fine on ${book.title} not charged for a lost copy`, tx);

      if (copy && condition === "OK") await holdService.offerCopy(ctx, { book, copy }, { dbc: tx, today, notices });
      else if (copy) await copyService.setStatus(ctx, copy.id, COPY_STATUS_ON_RETURN[condition], { dbc: tx });

      const charged = fromMinor(
        toMinor(charges.lateFine) + toMinor(charges.lostCharge) + toMinor(charges.damageCharge)
      );
      if (toMinor(charged) > 0) {
        const reason = lost ? "Lost" : condition === "DAMAGED" ? "Returned damaged" : "Returned late";
        notices.push(
          fineChargedNotice({
            loan: closed,
            title: book.title,
            accessionNumber: copy?.accessionNumber,
            charged,
            outstanding: outstandingOf(closed),
            reason,
            userIds: await fineRecipients(ctx, loan, policy)
          })
        );
      }
    });
    await sendNotices(ctx, notices);
    return loanService.getById(ctx, loanId);
  },

  /* A lost copy came back: on the shelf again (or to the next reader). Within the
     policy's window the replacement charge is reversed; what was paid towards it
     becomes library credit. Late fines stay. */
  recordFound: async (ctx, loanId, { notes }) => {
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    const outcome = await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      if (loan.status !== "LOST") throw conflict("This loan is not recorded as lost");
      const book = await bookService.lockForUpdate(ctx, loan.bookId, { dbc: tx });
      const copy = await copyService.lockById(ctx, loan.copyId, { dbc: tx });
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });

      const daysLost = daysBetween(loan.lostOn, today);
      const reversed = policy.lostFoundRefundDays > 0 && daysLost <= policy.lostFoundRefundDays ? loan.lostCharge : 0;
      const settlement = settle(loan, {
        lateFine: loan.lateFine,
        lostCharge: fromMinor(toMinor(loan.lostCharge) - toMinor(reversed)),
        damageCharge: loan.damageCharge
      });
      await loanRepository.update(
        ctx.tenantId,
        loanId,
        {
          ...settlement.changes,
          status: "RETURNED",
          returnedOn: today,
          foundOn: today,
          lostChargeReversed: fromMinor(toMinor(loan.lostChargeReversed) + toMinor(reversed)),
          returnNotes: notes ?? loan.returnNotes,
          returnedTo: ctx.userId
        },
        { dbc: tx }
      );
      await applySettlement(
        ctx,
        loan,
        settlement,
        `Replacement charge for ${book.title} reversed: the copy was found`,
        tx
      );
      if (copy) await holdService.offerCopy(ctx, { book, copy }, { dbc: tx, today, notices });
      return { reversed, credited: settlement.credit, daysLost, refundDays: policy.lostFoundRefundDays };
    });
    await sendNotices(ctx, notices);
    return { ...(await loanService.getById(ctx, loanId)), found: outcome };
  },

  /* New due date = today + the loan's period (next open day); not when overdue,
     out of renewals, or while other readers wait for the title */
  renew: async (ctx, loanId) => {
    const today = await tenantToday(ctx.tenantId);
    await transaction(async tx => {
      const loan = await lockLoan(ctx, loanId, tx);
      if (loan.status !== "ISSUED") throw unprocessable("Only a book that is on loan can be renewed");
      if (loan.dueDate < today) {
        throw unprocessable(`This loan is overdue (due ${loan.dueDate}); the book must be returned, not renewed`);
      }
      if (loan.renewalCount >= loan.maxRenewals) {
        throw unprocessable(
          `This loan has already been renewed ${loan.renewalCount} time(s), the most the library allows`
        );
      }
      const waiting = await holdService.countWaitingOthers(ctx, loan.bookId, loan.borrowerUserId, { dbc: tx });
      if (waiting) {
        throw unprocessable(
          `${plural(waiting, "reader is", "readers are")} waiting for this book; it must be returned, not renewed`
        );
      }
      const dueDate = await libraryCalendar.nextOpenDay(ctx, addDays(today, loan.loanDays));
      if (dueDate <= loan.dueDate) {
        throw unprocessable(`Renewing today would not extend the due date (${loan.dueDate})`);
      }
      await loanRepository.update(ctx.tenantId, loanId, { dueDate, renewalCount: loan.renewalCount + 1 }, { dbc: tx });
    });
    return loanService.getById(ctx, loanId);
  },

  list: async (ctx, { page, limit, ...filters }) => {
    const today = await tenantToday(ctx.tenantId);
    return presentPage(
      ctx,
      await loanRepository.list(ctx.tenantId, {
        page,
        limit,
        with: withDetails,
        conditions: listConditions(filters, today)
      }),
      today
    );
  },

  getById: async (ctx, loanId) => {
    const loan = await loanRepository.findById(ctx.tenantId, loanId, {
      with: {
        ...withDetails,
        payments: { orderBy: desc(libraryFinePayments.paidAt) },
        waivers: { orderBy: desc(libraryFineWaivers.waivedAt) }
      }
    });
    if (!loan) throw notFound("Loan");
    const [view] = await loanView.presentAll(ctx, [loan], await tenantToday(ctx.tenantId));
    return view;
  },

  /* For reports: open loans (only overdue ones when asked), fines as of today */
  findOpen: async (ctx, { overdueOnly = false } = {}) => {
    const today = await tenantToday(ctx.tenantId);
    const loans = await loanRepository.findMany(ctx.tenantId, {
      conditions: [eq(libraryLoans.status, "ISSUED"), overdueOnly && lt(libraryLoans.dueDate, today)].filter(Boolean),
      with: withDetails,
      orderBy: [asc(libraryLoans.dueDate), asc(libraryLoans.createdAt)]
    });
    return loanView.presentAll(ctx, loans, today);
  },

  /* For reports: every loan with something owed today */
  findOwing: async ctx => {
    const today = await tenantToday(ctx.tenantId);
    const loans = await loanRepository.findMany(ctx.tenantId, {
      conditions: [
        or(and(eq(libraryLoans.status, "ISSUED"), lt(libraryLoans.dueDate, today)), gt(libraryLoans.fineOutstanding, 0))
      ],
      with: withDetails,
      orderBy: [asc(libraryLoans.dueDate)]
    });
    return (await loanView.presentAll(ctx, loans, today)).filter(loan => toMinor(loan.fineOutstanding) > 0);
  },

  /* Self-service: the signed-in person's loans and history; a parent sees their children's */
  myLoans: async (ctx, { page, limit, ...filters }) => {
    const borrowerIds = await borrowers.visibleTo(ctx);
    if (!borrowerIds.length) return { rows: [], meta: buildPageMeta(page, limit, 0) };
    const today = await tenantToday(ctx.tenantId);
    return presentPage(
      ctx,
      await loanRepository.list(ctx.tenantId, {
        page,
        limit,
        with: withDetails,
        conditions: [inArray(libraryLoans.borrowerUserId, borrowerIds), ...listConditions(filters, today)]
      }),
      today
    );
  }
};
