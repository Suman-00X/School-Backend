import { relations, sql } from "drizzle-orm";
import { boolean, check, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { LATE_FEE_CHARGE_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const lateFeeChargeType = pgEnum("late_fee_charge_type", LATE_FEE_CHARGE_TYPES);

/* A predefined late-fee rule: slabs by delay after a grace period, optionally capped (D-19).
   At most one rule per school is the default, used by structures without their own. */
export const lateFeeRules = pgTable(
  "late_fee_rules",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    description: text("description"),
    graceDays: integer("grace_days").notNull().default(0),
    /* Most an invoice can be charged under this rule */
    maxAmount: money("max_amount"),
    isDefault: boolean("is_default").notNull().default(false)
  },
  t => [
    uniqueIndex("late_fee_rules_name_uq").on(t.tenantId, t.name).where(activeRows(t)),
    uniqueIndex("late_fee_rules_default_uq")
      .on(t.tenantId)
      .where(sql`${t.isDefault} = true AND ${t.isActive} = true`),
    check(
      "late_fee_rules_chk",
      sql`${t.graceDays} BETWEEN 0 AND 365 AND (${t.maxAmount} IS NULL OR ${t.maxAmount} > 0)`
    )
  ]
);

/* Days fromDay..toDay of delay (toDay null = and beyond). Contiguous from day 1. */
export const lateFeeSlabs = pgTable(
  "late_fee_slabs",
  {
    ...baseColumns(),
    lateFeeRuleId: uuid("late_fee_rule_id")
      .notNull()
      .references(() => lateFeeRules.id),
    fromDay: integer("from_day").notNull(),
    toDay: integer("to_day"),
    chargeType: lateFeeChargeType("charge_type").notNull(),
    amount: money("amount").notNull()
  },
  t => [
    uniqueIndex("late_fee_slabs_rule_from_uq").on(t.lateFeeRuleId, t.fromDay),
    check(
      "late_fee_slabs_chk",
      sql`${t.fromDay} >= 1 AND (${t.toDay} IS NULL OR ${t.toDay} >= ${t.fromDay}) AND ${t.amount} > 0`
    )
  ]
);

export const lateFeeRulesRelations = relations(lateFeeRules, ({ many }) => ({
  slabs: many(lateFeeSlabs)
}));

export const lateFeeSlabsRelations = relations(lateFeeSlabs, ({ one }) => ({
  rule: one(lateFeeRules, { fields: [lateFeeSlabs.lateFeeRuleId], references: [lateFeeRules.id] })
}));
