import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { DEFAULT_POLICY as D } from "../../shared/constants/library.constants.js";
import { money } from "../../shared/models/money.columns.js";

/* School-wide library settings: one row per school, created with the defaults
   (and the default circulation rules) on first read. Loan periods, limits and
   fines per borrower and item type are library_circulation_rules. */
export const libraryPolicies = pgTable(
  "library_policies",
  {
    ...baseColumns(),
    /* Blocks: fines above the threshold (null: fines never block), any overdue loan */
    fineBlockThreshold: money("fine_block_threshold").default(D.fineBlockThreshold),
    blockOnOverdue: boolean("block_on_overdue").notNull().default(D.blockOnOverdue),
    /* Fines and due dates follow the school calendar */
    skipClosedDaysInFines: boolean("skip_closed_days_in_fines").notNull().default(D.skipClosedDaysInFines),
    capFineAtPrice: boolean("cap_fine_at_price").notNull().default(D.capFineAtPrice),
    /* Lost copies */
    lostProcessingFee: money("lost_processing_fee").notNull().default(D.lostProcessingFee),
    lostMinimumCharge: money("lost_minimum_charge").notNull().default(D.lostMinimumCharge),
    lostIncludesLateFine: boolean("lost_includes_late_fine").notNull().default(D.lostIncludesLateFine),
    lostFoundRefundDays: integer("lost_found_refund_days").notNull().default(D.lostFoundRefundDays),
    /* Holds */
    holdPickupDays: integer("hold_pickup_days").notNull().default(D.holdPickupDays),
    maxHoldsPerBorrower: integer("max_holds_per_borrower").notNull().default(D.maxHoldsPerBorrower),
    /* Notifications */
    dueSoonDays: integer("due_soon_days").notNull().default(D.dueSoonDays),
    overdueReminderEveryDays: integer("overdue_reminder_every_days").notNull().default(D.overdueReminderEveryDays),
    notifyParents: boolean("notify_parents").notNull().default(D.notifyParents)
  },
  t => [
    uniqueIndex("library_policies_tenant_uq").on(t.tenantId),
    check(
      "library_policies_money_chk",
      sql`(${t.fineBlockThreshold} IS NULL OR ${t.fineBlockThreshold} >= 0) AND ${t.lostProcessingFee} >= 0 AND ${t.lostMinimumCharge} >= 0`
    ),
    check(
      "library_policies_days_chk",
      sql`${t.lostFoundRefundDays} >= 0 AND ${t.holdPickupDays} >= 1 AND ${t.maxHoldsPerBorrower} >= 0 AND ${t.dueSoonDays} >= 0 AND ${t.overdueReminderEveryDays} >= 1`
    )
  ]
);
