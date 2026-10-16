import { and, asc, between, desc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { journalEntries, journalLines, ledgerAccounts } from "../models/ledger.schema.js";

const amount = column => sql`coalesce(sum(${column}), 0)`.mapWith(Number);

/* Lines of live entries of one tenant (entries are never deactivated, but reads stay scoped) */
const liveLines = (tenantId, ...conditions) =>
  and(scoped(journalLines, tenantId), eq(journalEntries.isActive, true), ...conditions);

export const ledgerAccountRepository = {
  ...createRepository({ table: ledgerAccounts, queryKey: "ledgerAccounts", orderBy: asc(ledgerAccounts.code) }),

  /* Outside the caller's transaction on purpose: system accounts then exist even if that
     transaction rolls back, so their ids can be cached. Existing rows are left alone. */
  insertIfMissing: rows => db.insert(ledgerAccounts).values(rows).onConflictDoNothing().returning(),

  /* A system account by key (and fee head, for fee income) */
  findSystem: async (tenantId, systemKey, feeHeadId = null, { dbc = db } = {}) => {
    const [row] = await dbc
      .select()
      .from(ledgerAccounts)
      .where(
        scoped(
          ledgerAccounts,
          tenantId,
          eq(ledgerAccounts.systemKey, systemKey),
          feeHeadId ? eq(ledgerAccounts.feeHeadId, feeHeadId) : isNull(ledgerAccounts.feeHeadId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /* Codes already taken with a prefix (to number the next fee income account) */
  codesStartingWith: async (tenantId, prefix) =>
    (
      await db
        .select({ code: ledgerAccounts.code })
        .from(ledgerAccounts)
        .where(and(eq(ledgerAccounts.tenantId, tenantId), sql`${ledgerAccounts.code} LIKE ${`${prefix}%`}`))
    ).map(row => row.code),

  hasLines: async (tenantId, accountId) => {
    const [row] = await db
      .select({ id: journalLines.id })
      .from(journalLines)
      .where(and(eq(journalLines.tenantId, tenantId), eq(journalLines.accountId, accountId)))
      .limit(1);
    return Boolean(row);
  }
};

export const journalRepository = {
  ...createRepository({
    table: journalEntries,
    queryKey: "journalEntries",
    orderBy: [desc(journalEntries.entryDate), desc(journalEntries.sequence)]
  }),

  findBySourceEvent: async (tenantId, sourceType, sourceId, event, { dbc = db } = {}) => {
    const [row] = await dbc
      .select()
      .from(journalEntries)
      .where(
        scoped(
          journalEntries,
          tenantId,
          eq(journalEntries.sourceType, sourceType),
          eq(journalEntries.sourceId, sourceId),
          eq(journalEntries.event, event)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /* -> the new entry, or null when this source event was posted meanwhile */
  insertEntry: async (tenantId, values, { dbc }) => {
    const [row] = await dbc
      .insert(journalEntries)
      .values({ ...values, tenantId })
      .onConflictDoNothing({
        target: [journalEntries.tenantId, journalEntries.sourceType, journalEntries.sourceId, journalEntries.event]
      })
      .returning();
    return row ?? null;
  },

  insertLines: (tenantId, entryId, lines, { dbc }) =>
    dbc
      .insert(journalLines)
      .values(lines.map(line => ({ ...line, entryId, tenantId })))
      .returning(),

  /* What a source has posted so far, per account and student, in paise (debit positive) */
  netBySource: async (tenantId, sourceType, sourceId, { dbc = db } = {}) =>
    (
      await dbc
        .select({
          accountId: journalLines.accountId,
          studentId: journalLines.studentId,
          net: sql`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`.mapWith(Number)
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(liveLines(tenantId, eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId)))
        .groupBy(journalLines.accountId, journalLines.studentId)
    ).map(row => ({ accountId: row.accountId, studentId: row.studentId, netMinor: Math.round(row.net * 100) })),

  countBySource: (tenantId, sourceType, sourceId, { dbc = db } = {}) =>
    dbc.$count(
      journalEntries,
      scoped(journalEntries, tenantId, eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId))
    ),

  findReversalOf: async (tenantId, entryId) => {
    const [row] = await db
      .select()
      .from(journalEntries)
      .where(scoped(journalEntries, tenantId, eq(journalEntries.reversalOfId, entryId)))
      .limit(1);
    return row ?? null;
  }
};

export const ledgerReportRepository = {
  /* Debits and credits per account over a date range (from omitted: since the beginning) */
  turnover: (tenantId, { from, to }) =>
    db
      .select({
        accountId: journalLines.accountId,
        debit: amount(journalLines.debit),
        credit: amount(journalLines.credit)
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(
        liveLines(tenantId, from ? between(journalEntries.entryDate, from, to) : lte(journalEntries.entryDate, to))
      )
      .groupBy(journalLines.accountId),

  /* Debit minus credit on an account before a date (the opening balance) */
  netBefore: async (tenantId, accountId, before, { studentId } = {}) => {
    const [row] = await db
      .select({ net: sql`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`.mapWith(Number) })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(
        liveLines(
          tenantId,
          eq(journalLines.accountId, accountId),
          studentId && eq(journalLines.studentId, studentId),
          lt(journalEntries.entryDate, before)
        )
      );
    return row.net;
  },

  /* An account's lines in a date range, oldest first, each with the running debit-minus-credit
     of the range (the window runs before the page is cut, so every page carries it) */
  accountLines: async (tenantId, accountId, { from, to, studentId, page, limit }) => {
    const where = liveLines(
      tenantId,
      eq(journalLines.accountId, accountId),
      studentId && eq(journalLines.studentId, studentId),
      between(journalEntries.entryDate, from, to)
    );
    const order = [asc(journalEntries.entryDate), asc(journalEntries.sequence), asc(journalLines.id)];
    const [rows, [{ total }], [totals]] = await Promise.all([
      db
        .select({
          entryId: journalEntries.id,
          entryNumber: journalEntries.entryNumber,
          entryDate: journalEntries.entryDate,
          narration: journalEntries.narration,
          sourceType: journalEntries.sourceType,
          sourceId: journalEntries.sourceId,
          lineId: journalLines.id,
          debit: journalLines.debit,
          credit: journalLines.credit,
          studentId: journalLines.studentId,
          memo: journalLines.memo,
          running:
            sql`sum(${journalLines.debit} - ${journalLines.credit}) over (order by ${journalEntries.entryDate}, ${journalEntries.sequence}, ${journalLines.id})`.mapWith(
              Number
            )
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ total: sql`count(*)`.mapWith(Number) })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(where),
      db
        .select({ debit: amount(journalLines.debit), credit: amount(journalLines.credit) })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(where)
    ]);
    return { rows, totals, meta: buildPageMeta(page, limit, total) };
  },

  /* Entries touching an account or a student (journal filters) */
  entryIdsWith: (tenantId, { accountId, studentId }) =>
    db
      .selectDistinct({ id: journalLines.entryId })
      .from(journalLines)
      .where(
        and(
          scoped(journalLines, tenantId),
          accountId && eq(journalLines.accountId, accountId),
          studentId && eq(journalLines.studentId, studentId)
        )
      )
};
