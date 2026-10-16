import { eq, inArray } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, todayIn } from "../../../../common/utils/date.util.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { bookService } from "../../books/index.js";
import { circulationRuleService } from "../../circulation-rules/index.js";
import { copyService } from "../../copies/index.js";
import { libraryPolicyService } from "../../policy/index.js";
import { sendNotices } from "../../shared/jobs/notice.job.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { libraryCalendar } from "../../shared/services/libraryCalendar.service.js";
import { fullName, itemTypeOf } from "../../shared/utils/circulation.util.js";
import { lockBorrower } from "../../shared/utils/locks.util.js";
import { holdReadyNotice } from "../../shared/utils/notices.util.js";
import { libraryHolds as holds } from "../models/hold.schema.js";
import { holdRepository } from "../repositories/hold.repository.js";

const withDetails = {
  book: { columns: { id: true, title: true, authors: true, itemType: true } },
  copy: { columns: { id: true, accessionNumber: true } },
  borrower: { columns: { id: true, firstName: true, lastName: true, role: true } }
};

const present = async (ctx, hold) => ({
  ...hold,
  borrower: hold.borrower && { ...hold.borrower, name: fullName(hold.borrower) },
  queuePosition: hold.status === "WAITING" ? await holdRepository.queuePosition(ctx.tenantId, hold) : null
});

const presentAll = async (ctx, result) => ({
  ...result,
  rows: await Promise.all(result.rows.map(hold => present(ctx, hold)))
});

const listConditions = ({ status, bookId, borrowerUserId, open }) =>
  [
    status && eq(holds.status, status),
    bookId && eq(holds.bookId, bookId),
    borrowerUserId && eq(holds.borrowerUserId, borrowerUserId),
    open === true && inArray(holds.status, ["WAITING", "READY"])
  ].filter(Boolean);

const closedMessage = hold =>
  hold.status === "FULFILLED" ? "This hold was already fulfilled" : `This hold is already ${hold.status.toLowerCase()}`;

/* Hold the (locked, free) copy for `hold`: READY until the pickup date */
const makeReady = async (ctx, hold, { book, copy }, { dbc, today, notices }) => {
  const policy = await libraryPolicyService.get(ctx, { dbc });
  const pickupBy = await libraryCalendar.nextOpenDay(ctx, addDays(today, policy.holdPickupDays));
  const ready = await holdRepository.update(
    ctx.tenantId,
    hold.id,
    { status: "READY", copyId: copy.id, readyOn: today, pickupBy },
    { dbc }
  );
  await copyService.setStatus(ctx, copy.id, "ON_HOLD", { dbc });
  notices.push(holdReadyNotice({ hold: ready, title: book.title, accessionNumber: copy.accessionNumber }));
  return ready;
};

/* Close a hold; a copy it kept goes to the next in the queue (or the shelf) */
const closeHold = async (ctx, hold, { status, reason }, { dbc, today, notices }) => {
  await holdRepository.update(
    ctx.tenantId,
    hold.id,
    { status, closedAt: new Date(), closedReason: reason, closedBy: ctx.userId ?? null },
    { dbc }
  );
  if (hold.status === "READY") {
    const book = await bookService.findById(ctx, hold.bookId, { dbc });
    const copy = await copyService.lockById(ctx, hold.copyId, { dbc });
    if (copy?.status === "ON_HOLD") await holdService.offerCopy(ctx, { book, copy }, { dbc, today, notices });
  }
};

export const holdService = {
  /* For circulation, inside the caller's transaction, with the book (then the
     copy) locked. A copy that has come free is held for the first borrower in
     the title's queue, or goes back on the shelf. -> the READY hold, or null */
  offerCopy: async (ctx, { book, copy }, { dbc, today, notices }) => {
    const next =
      itemTypeOf(copy, book) === "REFERENCE"
        ? null
        : await holdRepository.lockNextWaiting(ctx.tenantId, book.id, today, { dbc });
    if (!next) {
      await copyService.setStatus(ctx, copy.id, "AVAILABLE", { dbc });
      return null;
    }
    return makeReady(ctx, next, { book, copy }, { dbc, today, notices });
  },

  /* Offer every copy on the shelf to the queue (new copies, a hold placed) */
  fillQueue: async (ctx, book, { dbc, today, notices }) => {
    for (const copy of await copyService.lockAvailableOfBook(ctx, book.id, { dbc })) {
      if (itemTypeOf(copy, book) === "REFERENCE") continue;
      const next = await holdRepository.lockNextWaiting(ctx.tenantId, book.id, today, { dbc });
      if (!next) return;
      await makeReady(ctx, next, { book, copy }, { dbc, today, notices });
    }
  },

  /* The copy kept for a READY hold leaves the hold shelf (marked missing, damaged…):
     the hold goes back to the front of the queue (it keeps its request time) */
  releaseCopy: async (ctx, copy, { dbc }) => {
    const hold = await holdRepository.lockReadyForCopy(ctx.tenantId, copy.id, { dbc });
    if (!hold) return;
    await holdRepository.update(
      ctx.tenantId,
      hold.id,
      { status: "WAITING", copyId: null, readyOn: null, pickupBy: null },
      { dbc }
    );
  },

  /* Issue: the borrower's open hold on the title (locked), if any.
     A copy kept for someone else cannot be lent to anyone but them. */
  holdForIssue: async (ctx, { book, copy, borrower }, { dbc }) => {
    if (copy.status === "ON_HOLD") {
      const kept = await holdRepository.lockReadyForCopy(ctx.tenantId, copy.id, { dbc });
      if (kept && kept.borrowerUserId !== borrower.id) {
        const holder = await borrowers.nameOf(ctx, kept.borrowerUserId);
        throw conflict(`Copy ${copy.accessionNumber} is held for ${holder} until ${kept.pickupBy}`);
      }
    }
    return holdRepository.lockOpenFor(ctx.tenantId, book.id, borrower.id, { dbc });
  },

  /* Issue: the hold is met by this loan. A different copy kept for the borrower goes to the next reader. */
  fulfil: async (ctx, hold, { book, copy, loanId }, { dbc, today, notices }) => {
    await holdRepository.update(
      ctx.tenantId,
      hold.id,
      { status: "FULFILLED", fulfilledLoanId: loanId, closedAt: new Date(), closedBy: ctx.userId },
      { dbc }
    );
    if (hold.status === "READY" && hold.copyId !== copy.id) {
      const kept = await copyService.lockById(ctx, hold.copyId, { dbc });
      if (kept?.status === "ON_HOLD") await holdService.offerCopy(ctx, { book, copy: kept }, { dbc, today, notices });
    }
  },

  countWaitingOthers: (ctx, bookId, userId, options) =>
    holdRepository.countWaitingOthers(ctx.tenantId, bookId, userId, options),

  /* Reserve a title for a borrower. When a copy is on the shelf it is held at once. */
  place: async (ctx, { bookId, borrowerUserId, notNeededAfter }) => {
    const borrower = await borrowers.forCirculation(ctx, borrowerUserId);
    const today = await tenantToday(ctx.tenantId);
    if (notNeededAfter && notNeededAfter < today) throw unprocessable("notNeededAfter must not be in the past");
    const notices = [];

    const holdId = await transaction(async tx => {
      await lockBorrower(ctx.tenantId, borrower.id, { dbc: tx });
      const book = await bookService.lockForUpdate(ctx, bookId, { dbc: tx });
      if (!book) throw unprocessable("bookId does not refer to a book in the catalogue");
      if (book.itemType === "REFERENCE") {
        throw unprocessable(`${book.title} is a reference book; it can be read in the library but not reserved`);
      }
      const { rule } = await circulationRuleService.resolve(ctx, borrower, book.itemType, { dbc: tx });
      if (!rule || rule.maxLoans === 0) {
        throw unprocessable(`No circulation rule lets ${borrower.name} borrow ${book.title}`);
      }

      const existing = await holdRepository.lockOpenFor(ctx.tenantId, book.id, borrower.id, { dbc: tx });
      if (existing) throw conflict(`${borrower.name} already has a hold on ${book.title}`);
      if (await holdRepository.hasOnLoan(ctx.tenantId, book.id, borrower.id, { dbc: tx })) {
        throw unprocessable(`${borrower.name} already has ${book.title} on loan`);
      }
      const policy = await libraryPolicyService.get(ctx, { dbc: tx });
      const open = await holdRepository.countOpenForBorrower(ctx.tenantId, borrower.id, { dbc: tx });
      if (open >= policy.maxHoldsPerBorrower) {
        throw unprocessable(
          `${borrower.name} already has ${open} open hold(s), the most the library allows is ${policy.maxHoldsPerBorrower}`
        );
      }

      const hold = await holdRepository.create(
        ctx.tenantId,
        { bookId, borrowerUserId: borrower.id, notNeededAfter, placedBy: ctx.userId },
        { dbc: tx }
      );
      await holdService.fillQueue(ctx, book, { dbc: tx, today, notices });
      return hold.id;
    });
    await sendNotices(ctx, notices);
    return holdService.getById(ctx, holdId);
  },

  /* Cancel an open hold; a copy it kept goes to the next reader */
  cancel: async (ctx, holdId, { reason } = {}) => {
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    await transaction(async tx => {
      const found = await holdRepository.findById(ctx.tenantId, holdId, { dbc: tx });
      if (!found) throw notFound("Hold");
      await bookService.lockForUpdate(ctx, found.bookId, { dbc: tx });
      const hold = await holdRepository.lockById(ctx.tenantId, holdId, { dbc: tx });
      if (!["WAITING", "READY"].includes(hold.status)) throw conflict(closedMessage(hold));
      await closeHold(ctx, hold, { status: "CANCELLED", reason: reason ?? "Cancelled" }, { dbc: tx, today, notices });
    });
    await sendNotices(ctx, notices);
    return holdService.getById(ctx, holdId);
  },

  /* Every open hold of a borrower (a student who left) */
  cancelAllFor: async (ctx, userId, reason) => {
    const open = await holdRepository.findMany(ctx.tenantId, {
      conditions: listConditions({ borrowerUserId: userId, open: true })
    });
    for (const hold of open) {
      await holdService.cancel(ctx, hold.id, { reason }).catch(error => {
        /* Fulfilled or expired meanwhile */
        if (error.status !== 409) throw error;
      });
    }
    return open.length;
  },

  list: async (ctx, { page, limit, ...filters }) =>
    presentAll(
      ctx,
      await holdRepository.list(ctx.tenantId, { page, limit, with: withDetails, conditions: listConditions(filters) })
    ),

  getById: async (ctx, holdId) => {
    const hold = await holdRepository.findById(ctx.tenantId, holdId, { with: withDetails });
    if (!hold) throw notFound("Hold");
    return present(ctx, hold);
  },

  /* Self-service: holds of the signed-in person (a parent: their children's) */
  myHolds: async (ctx, { page, limit, ...filters }) => {
    const ids = await borrowers.visibleTo(ctx);
    if (!ids.length) return { rows: [], meta: buildPageMeta(page, limit, 0) };
    return presentAll(
      ctx,
      await holdRepository.list(ctx.tenantId, {
        page,
        limit,
        with: withDetails,
        conditions: [inArray(holds.borrowerUserId, ids), ...listConditions(filters)]
      })
    );
  },

  /* Self-service: for yourself, or a parent for one of their children */
  placeMine: async (ctx, { borrowerUserId, ...data }) => {
    if (!borrowerUserId && ctx.role === ROLES.PARENT) {
      throw unprocessable("Parents cannot borrow books; send borrowerUserId to reserve for your child");
    }
    borrowerUserId ??= ctx.userId;
    await borrowers.assertVisible(ctx, borrowerUserId);
    return holdService.place(ctx, { ...data, borrowerUserId });
  },

  cancelMine: async (ctx, holdId) => {
    const hold = await holdRepository.findById(ctx.tenantId, holdId);
    if (!hold || !(await borrowers.visibleTo(ctx)).includes(hold.borrowerUserId)) throw notFound("Hold");
    return holdService.cancel(ctx, holdId, { reason: "Cancelled by the borrower" });
  },

  /* Daily, every school: READY holds not collected by their pickup date and WAITING
     holds past "not needed after" expire; kept copies go to the next reader */
  expireHolds: async () => {
    const todays = new Map();
    let expired = 0;
    for (const { id, tenantId } of await holdRepository.findPossiblyExpired()) {
      const ctx = { tenantId, role: "SYSTEM" };
      if (!todays.has(tenantId)) todays.set(tenantId, todayIn((await getTenant(tenantId))?.timezone ?? "UTC"));
      const today = todays.get(tenantId);
      const notices = [];
      const done = await transaction(async tx => {
        const found = await holdRepository.findById(tenantId, id, { dbc: tx });
        if (!found) return false;
        await bookService.lockForUpdate(ctx, found.bookId, { dbc: tx });
        const hold = await holdRepository.lockById(tenantId, id, { dbc: tx });
        const uncollected = hold.status === "READY" && hold.pickupBy < today;
        const unwanted = hold.status === "WAITING" && hold.notNeededAfter && hold.notNeededAfter < today;
        if (!uncollected && !unwanted) return false;
        const reason = uncollected ? `Not collected by ${hold.pickupBy}` : `Not needed after ${hold.notNeededAfter}`;
        await closeHold(ctx, hold, { status: "EXPIRED", reason }, { dbc: tx, today, notices });
        return true;
      });
      await sendNotices(ctx, notices);
      if (done) expired++;
    }
    return { expired };
  }
};
