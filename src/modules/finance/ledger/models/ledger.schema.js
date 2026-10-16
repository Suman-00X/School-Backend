import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { LEDGER_ACCOUNT_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const ledgerAccountType = pgEnum("ledger_account_type", LEDGER_ACCOUNT_TYPES);

/* A school's chart of accounts. System accounts (system_key set) are created on first
   use with stable codes; fee income has one account per fee head. Schools add their own. */
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    ...baseColumns(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: ledgerAccountType("account_type").notNull(),
    /* Carries the opposite of its type's normal balance (concessions reduce income) */
    isContra: boolean("is_contra").notNull().default(false),
    /* CASH, RECEIVABLES, FEE_INCOME…; null for a school's own accounts */
    systemKey: text("system_key"),
    feeHeadId: uuid("fee_head_id").references(() => feeHeads.id),
    description: text("description")
  },
  t => [
    uniqueIndex("ledger_accounts_tenant_code_uq").on(t.tenantId, t.code).where(activeRows(t)),
    uniqueIndex("ledger_accounts_system_key_uq")
      .on(t.tenantId, t.systemKey)
      .where(sql`${t.systemKey} IS NOT NULL AND ${t.feeHeadId} IS NULL`),
    uniqueIndex("ledger_accounts_fee_head_uq")
      .on(t.tenantId, t.feeHeadId)
      .where(sql`${t.feeHeadId} IS NOT NULL`),
    check("ledger_accounts_code_chk", sql`${t.code} ~ '^[0-9A-Z][0-9A-Z.-]{1,19}$'`),
    check(
      "ledger_accounts_fee_head_chk",
      sql`${t.feeHeadId} IS NULL OR (${t.systemKey} = 'FEE_INCOME' AND ${t.accountType} = 'INCOME')`
    ),
    check("ledger_accounts_system_chk", sql`${t.systemKey} IS NULL OR ${t.isActive}`)
  ]
);

/* One balanced, immutable posting. Triggers reject UPDATE and DELETE (corrections are
   reversing entries) and check at commit that debits equal credits (and the total).
   (tenant, source type, source id, event) is unique, so a source event posts once. */
export const journalEntries = pgTable(
  "journal_entries",
  {
    ...baseColumns(),
    sequence: integer("sequence").notNull(),
    /* JE-000001 */
    entryNumber: text("entry_number").notNull(),
    entryDate: date("entry_date").notNull(),
    narration: text("narration").notNull(),
    /* INVOICE, PAYMENT, REFUND, STUDENT_CREDIT, MANUAL… and the record it came from */
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    /* issued, received, late-fee:2… */
    event: text("event").notNull(),
    /* Sum of the debits (= sum of the credits) */
    total: money("total").notNull(),
    reversalOfId: uuid("reversal_of_id").references(() => journalEntries.id),
    postedBy: uuid("posted_by").references(() => users.id)
  },
  t => [
    uniqueIndex("journal_entries_tenant_sequence_uq").on(t.tenantId, t.sequence),
    uniqueIndex("journal_entries_source_event_uq").on(t.tenantId, t.sourceType, t.sourceId, t.event),
    /* An entry is reversed at most once */
    uniqueIndex("journal_entries_reversal_uq")
      .on(t.reversalOfId)
      .where(sql`${t.reversalOfId} IS NOT NULL`),
    index("journal_entries_date_idx").on(t.tenantId, t.entryDate, t.sequence),
    index("journal_entries_source_idx").on(t.tenantId, t.sourceType, t.sourceId),
    check("journal_entries_total_chk", sql`${t.total} > 0`),
    check(
      "journal_entries_source_chk",
      sql`${t.sourceType} ~ '^[A-Z][A-Z_]{1,39}$' AND length(${t.event}) BETWEEN 1 AND 80`
    )
  ]
);

/* A debit or a credit to one account. student_id is the sub-ledger of receivables and credit. */
export const journalLines = pgTable(
  "journal_lines",
  {
    ...baseColumns(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
    studentId: uuid("student_id").references(() => students.id),
    memo: text("memo")
  },
  t => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.tenantId, t.accountId),
    index("journal_lines_student_idx").on(t.tenantId, t.studentId),
    /* Exactly one side, positive */
    check(
      "journal_lines_amount_chk",
      sql`${t.debit} >= 0 AND ${t.credit} >= 0 AND (${t.debit} > 0) <> (${t.credit} > 0)`
    )
  ]
);

export const ledgerAccountsRelations = relations(ledgerAccounts, ({ one }) => ({
  feeHead: one(feeHeads, { fields: [ledgerAccounts.feeHeadId], references: [feeHeads.id] })
}));

export const journalEntriesRelations = relations(journalEntries, ({ many, one }) => ({
  lines: many(journalLines),
  poster: one(users, { fields: [journalEntries.postedBy], references: [users.id] })
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, { fields: [journalLines.entryId], references: [journalEntries.id] }),
  account: one(ledgerAccounts, { fields: [journalLines.accountId], references: [ledgerAccounts.id] }),
  student: one(students, { fields: [journalLines.studentId], references: [students.id] })
}));
