import { randomUUID } from "node:crypto";
import { between, eq, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { nextSequence, pad } from "../../../../common/sequences/sequence.service.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { JOURNAL_SOURCES } from "../../shared/constants/finance.constants.js";
import { journalEntries } from "../models/ledger.schema.js";
import { journalRepository as journal, ledgerReportRepository as reports } from "../repositories/ledger.repository.js";
import { ledgerAccountService as chart } from "./account.service.js";

const withLines = {
  lines: {
    with: {
      account: { columns: { id: true, code: true, name: true, accountType: true } },
      student: {
        columns: { id: true, studentCode: true, admissionNumber: true },
        with: { user: { columns: { firstName: true, lastName: true } } }
      }
    }
  },
  poster: { columns: { id: true, firstName: true, lastName: true, role: true } }
};

/* A line's account: { accountId } | { accountCode } | { key } (system) | { feeHeadId } (fee income) */
const accountRef = line => {
  const { accountId, accountCode, key, feeHeadId } = line.account ?? line;
  return { accountId, accountCode, key, feeHeadId };
};

/* Lines in paise, without empty ones; each has exactly one side */
const normalise = lines =>
  lines
    .map(line => ({ ...line, debitMinor: toMinor(line.debit), creditMinor: toMinor(line.credit) }))
    .filter(line => line.debitMinor !== 0 || line.creditMinor !== 0)
    .map(line => {
      if (line.debitMinor < 0 || line.creditMinor < 0 || (line.debitMinor > 0 && line.creditMinor > 0)) {
        throw unprocessable("Each journal line is either a debit or a credit, and positive");
      }
      return line;
    });

const insert = async (ctx, { date, narration, sourceType, sourceId, event, lines, reversalOfId }, tx) => {
  const prepared = normalise(lines);
  if (!prepared.length) return null;
  const debits = prepared.reduce((sum, line) => sum + line.debitMinor, 0);
  const credits = prepared.reduce((sum, line) => sum + line.creditMinor, 0);
  if (debits !== credits) {
    throw unprocessable(
      `The journal entry does not balance: debits ${fromMinor(debits).toFixed(2)}, credits ${fromMinor(credits).toFixed(2)}`
    );
  }
  if (prepared.length < 2) throw unprocessable("A journal entry needs at least two lines");

  /* The same source event again (a retry, a repeated webhook) posts nothing */
  const existing = await journal.findBySourceEvent(ctx.tenantId, sourceType, sourceId, event, { dbc: tx });
  if (existing) return { ...existing, duplicate: true };

  const accountIds = [];
  for (const line of prepared) accountIds.push(await chart.resolve(ctx.tenantId, accountRef(line), { dbc: tx }));
  const sequence = await nextSequence(ctx.tenantId, "JOURNAL", { dbc: tx });
  const entry = await journal.insertEntry(
    ctx.tenantId,
    {
      sequence,
      entryNumber: `JE-${pad(sequence, 6)}`,
      entryDate: date ?? (await tenantToday(ctx.tenantId)),
      narration,
      sourceType,
      sourceId,
      event,
      total: fromMinor(debits),
      reversalOfId: reversalOfId ?? null,
      postedBy: ctx.userId ?? null
    },
    { dbc: tx }
  );
  /* Posted by a concurrent transaction that committed first */
  if (!entry)
    return { ...(await journal.findBySourceEvent(ctx.tenantId, sourceType, sourceId, event)), duplicate: true };

  const inserted = await journal.insertLines(
    ctx.tenantId,
    entry.id,
    prepared.map((line, index) => ({
      accountId: accountIds[index],
      debit: fromMinor(line.debitMinor),
      credit: fromMinor(line.creditMinor),
      studentId: line.studentId ?? null,
      memo: line.memo ?? null
    })),
    { dbc: tx }
  );
  return { ...entry, lines: inserted };
};

export const ledgerService = {
  /* Post one balanced journal entry. Other modules call this from inside their own
     transaction ({ dbc: tx }), so the entry commits or rolls back with the business change.

       ledgerService.post(ctx, {
         date: "2026-10-16",                       // default: today at the school
         narration: "Library fine LIBR-000004",
         sourceType: "LIBRARY_FINE", sourceId: fine.id, event: "paid",
         lines: [
           { account: { key: "CASH" }, debit: 50 },
           { account: { accountCode: "4810" }, credit: 50 }
         ]
       }, { dbc: tx });

     A line names its account as { key } (a system account), { feeHeadId }, { accountId } or
     { accountCode }, and may carry studentId and memo. (sourceType, sourceId, event) posts
     once: repeating it returns the first entry with duplicate: true. Entries whose lines
     are all zero post nothing (-> null). The database checks the balance again at commit. */
  post: (ctx, entry, { dbc } = {}) => (dbc ? insert(ctx, entry, dbc) : transaction(tx => insert(ctx, entry, tx))),

  /* For finance submodules: what a source has posted so far, and how many entries */
  postedBy: (ctx, sourceType, sourceId, { dbc } = {}) =>
    journal.netBySource(ctx.tenantId, sourceType, sourceId, { dbc }),
  entriesOf: (ctx, sourceType, sourceId, { dbc } = {}) =>
    journal.countBySource(ctx.tenantId, sourceType, sourceId, { dbc }),
  entryFor: (ctx, sourceType, sourceId, event, { dbc } = {}) =>
    journal.findBySourceEvent(ctx.tenantId, sourceType, sourceId, event, { dbc }),

  /* An adjustment by an accountant. Control accounts (receivables, student credit) are
     kept by invoices, payments and credit, so they take no manual entries. */
  postManual: async (ctx, { date, narration, lines }) => {
    if (date && date > (await tenantToday(ctx.tenantId))) throw unprocessable("date cannot be in the future");
    const all = await chart.all(ctx);
    for (const line of lines) {
      const account = all.find(a => a.id === line.accountId);
      if (!account) throw unprocessable(`accountId ${line.accountId} does not refer to a ledger account`);
      if (chart.isControl(account)) {
        throw unprocessable(
          `${account.code} ${account.name} is kept by invoices, payments and student credit; it cannot take manual entries`
        );
      }
    }
    const sourceId = randomUUID();
    const entry = await ledgerService.post(ctx, {
      date,
      narration,
      sourceType: JOURNAL_SOURCES.MANUAL,
      sourceId,
      event: "posted",
      lines: lines.map(line => ({ ...line, account: { accountId: line.accountId } }))
    });
    return ledgerService.getById(ctx, entry.id);
  },

  /* Undo a manual entry with its mirror image. Automatic entries are corrected through
     their records (cancel the invoice, refund the payment), which post their own reversals. */
  reverse: async (ctx, entryId, { reason, date }) => {
    const original = await ledgerService.getById(ctx, entryId);
    if (original.sourceType !== JOURNAL_SOURCES.MANUAL) {
      throw unprocessable(
        `${original.entryNumber} was posted by a ${original.sourceType.toLowerCase().replaceAll("_", " ")}; correct that record instead`
      );
    }
    if (original.reversalOfId) throw unprocessable(`${original.entryNumber} is itself a reversal`);
    const already = await journal.findReversalOf(ctx.tenantId, entryId);
    if (already) throw conflict(`${original.entryNumber} was already reversed by ${already.entryNumber}`);

    const entry = await ledgerService.post(ctx, {
      date,
      narration: `Reversal of ${original.entryNumber}: ${reason}`,
      sourceType: JOURNAL_SOURCES.MANUAL,
      sourceId: original.sourceId,
      event: "reversed",
      reversalOfId: original.id,
      lines: original.lines.map(line => ({
        account: { accountId: line.accountId },
        debit: line.credit,
        credit: line.debit,
        studentId: line.studentId,
        memo: line.memo
      }))
    });
    return ledgerService.getById(ctx, entry.id);
  },

  list: async (ctx, { page, limit, from, to, sourceType, sourceId, accountId, studentId }) =>
    journal.list(ctx.tenantId, {
      page,
      limit,
      with: withLines,
      conditions: [
        from && to && between(journalEntries.entryDate, from, to),
        sourceType && eq(journalEntries.sourceType, sourceType),
        sourceId && eq(journalEntries.sourceId, sourceId),
        (accountId || studentId) &&
          inArray(journalEntries.id, reports.entryIdsWith(ctx.tenantId, { accountId, studentId }))
      ].filter(Boolean)
    }),

  getById: async (ctx, entryId) => {
    const entry = await journal.findById(ctx.tenantId, entryId, { with: withLines });
    if (!entry) throw notFound("Journal entry");
    return entry;
  }
};
