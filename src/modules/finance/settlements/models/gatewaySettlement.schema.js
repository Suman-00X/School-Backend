import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { journalEntries } from "../../ledger/models/ledger.schema.js";
import { money } from "../../shared/models/money.columns.js";

/* A payout from the payment gateway into the school's bank, imported from the gateway
   (D-63): what reached the bank, the fees it kept (tax included), and its ledger entry.
   Imported once, however often the import runs. */
export const gatewaySettlements = pgTable(
  "gateway_settlements",
  {
    ...baseColumns(),
    provider: text("provider").notNull(),
    settlementId: text("settlement_id").notNull(),
    amount: money("amount").notNull(),
    fees: money("fees").notNull().default(0),
    tax: money("tax").notNull().default(0),
    utr: text("utr"),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull(),
    /* No foreign key: the journal is append-only and must stay truncate-guarded by its own
       trigger; the entry is also found by its source (SETTLEMENT, this row's id) */
    journalEntryId: uuid("journal_entry_id")
  },
  t => [
    uniqueIndex("gateway_settlements_tenant_settlement_uq").on(t.tenantId, t.provider, t.settlementId),
    index("gateway_settlements_settled_idx").on(t.tenantId, t.settledAt),
    check(
      "gateway_settlements_amount_chk",
      sql`${t.amount} >= 0 AND ${t.fees} >= 0 AND ${t.tax} >= 0 AND ${t.tax} <= ${t.fees} AND ${t.amount} + ${t.fees} > 0`
    )
  ]
);

export const gatewaySettlementsRelations = relations(gatewaySettlements, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [gatewaySettlements.journalEntryId], references: [journalEntries.id] })
}));
