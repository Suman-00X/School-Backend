import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryLoans } from "../../loans/models/loan.schema.js";
import { libraryHolds as holds } from "../models/hold.schema.js";

const open = inArray(holds.status, ["WAITING", "READY"]);

/* First row of a locking select, or null */
const lockOne = async query => (await query.limit(1).for("update"))[0] ?? null;

export const holdRepository = {
  ...createRepository({ table: holds, queryKey: "libraryHolds", orderBy: [desc(holds.requestedAt)] }),

  lockById: (tenantId, holdId, { dbc }) =>
    lockOne(
      dbc
        .select()
        .from(holds)
        .where(scoped(holds, tenantId, eq(holds.id, holdId)))
    ),

  /* The head of a title's queue: the oldest WAITING hold still wanted on `today` */
  lockNextWaiting: (tenantId, bookId, today, { dbc }) =>
    lockOne(
      dbc
        .select()
        .from(holds)
        .where(
          scoped(
            holds,
            tenantId,
            eq(holds.bookId, bookId),
            eq(holds.status, "WAITING"),
            or(isNull(holds.notNeededAfter), gte(holds.notNeededAfter, today))
          )
        )
        .orderBy(asc(holds.requestedAt), asc(holds.id))
    ),

  /* The READY hold a copy is kept for */
  lockReadyForCopy: (tenantId, copyId, { dbc }) =>
    lockOne(
      dbc
        .select()
        .from(holds)
        .where(scoped(holds, tenantId, eq(holds.copyId, copyId), eq(holds.status, "READY")))
    ),

  /* A borrower's open hold on a title */
  lockOpenFor: (tenantId, bookId, userId, { dbc }) =>
    lockOne(
      dbc
        .select()
        .from(holds)
        .where(scoped(holds, tenantId, eq(holds.bookId, bookId), eq(holds.borrowerUserId, userId), open))
    ),

  /* A borrower already has a copy of the title on loan */
  hasOnLoan: async (tenantId, bookId, userId, { dbc = db } = {}) =>
    (await dbc.$count(
      libraryLoans,
      scoped(
        libraryLoans,
        tenantId,
        eq(libraryLoans.bookId, bookId),
        eq(libraryLoans.borrowerUserId, userId),
        eq(libraryLoans.status, "ISSUED")
      )
    )) > 0,

  countOpenForBorrower: (tenantId, userId, { dbc = db } = {}) =>
    dbc.$count(holds, scoped(holds, tenantId, eq(holds.borrowerUserId, userId), open)),

  /* Others waiting for a title (renewals are refused while anyone is) */
  countWaitingOthers: (tenantId, bookId, userId, { dbc = db } = {}) =>
    dbc.$count(
      holds,
      scoped(
        holds,
        tenantId,
        eq(holds.bookId, bookId),
        eq(holds.status, "WAITING"),
        sql`${holds.borrowerUserId} <> ${userId}`
      )
    ),

  /* 1-based place in the queue of a WAITING hold (compared in SQL: timestamps
     have microseconds, JavaScript dates only milliseconds) */
  queuePosition: async (tenantId, hold, { dbc = db } = {}) =>
    1 +
    (await dbc.$count(
      holds,
      scoped(
        holds,
        tenantId,
        eq(holds.bookId, hold.bookId),
        eq(holds.status, "WAITING"),
        sql`(${holds.requestedAt}, ${holds.id}) < (SELECT h.requested_at, h.id FROM library_holds h WHERE h.id = ${hold.id} AND h.tenant_id = ${tenantId} AND h.is_active)`
      )
    )),

  /* All tenants: READY holds past pickup and WAITING holds no longer wanted, in a
     wide window around the database's date (callers compare with each school's today) */
  findPossiblyExpired: () =>
    db
      .select({ id: holds.id, tenantId: holds.tenantId })
      .from(holds)
      .where(
        and(
          eq(holds.isActive, true),
          or(
            and(eq(holds.status, "READY"), lt(holds.pickupBy, sql`current_date + 2`)),
            and(eq(holds.status, "WAITING"), lt(holds.notNeededAfter, sql`current_date + 2`))
          )
        )
      )
};
