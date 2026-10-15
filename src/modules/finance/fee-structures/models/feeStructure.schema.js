import { relations, sql } from "drizzle-orm";
import { check, date, integer, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { classes } from "../../../academics/classes/models/class.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { LATE_FEE_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const lateFeeType = pgEnum("late_fee_type", LATE_FEE_TYPES);

/* What a class pays in an academic year, split into installments.
   classId null = applies to every class. */
export const feeStructures = pgTable(
  "fee_structures",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: uuid("class_id").references(() => classes.id),
    name: text("name").notNull(),
    description: text("description"),
    lateFeeType: lateFeeType("late_fee_type").notNull().default("NONE"),
    lateFeeAmount: money("late_fee_amount").notNull().default(0),
    lateFeeGraceDays: integer("late_fee_grace_days").notNull().default(0),
    /* Maximum late fee per invoice (PER_DAY) */
    lateFeeCap: money("late_fee_cap")
  },
  t => [
    uniqueIndex("fee_structures_year_class_name_uq")
      .on(t.academicYearId, t.classId, t.name)
      .where(sql`${t.isActive} = true`),
    check("fee_structures_late_fee_chk", sql`${t.lateFeeAmount} >= 0 AND ${t.lateFeeGraceDays} >= 0`)
  ]
);

export const feeStructureItems = pgTable(
  "fee_structure_items",
  {
    ...baseColumns(),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id),
    feeHeadId: uuid("fee_head_id")
      .notNull()
      .references(() => feeHeads.id),
    amount: money("amount").notNull()
  },
  t => [
    uniqueIndex("fee_structure_items_head_uq").on(t.feeStructureId, t.feeHeadId),
    check("fee_structure_items_amount_chk", sql`${t.amount} > 0`)
  ]
);

/* An installment takes sharePercent of every item; shares add up to 100 */
export const feeInstallments = pgTable(
  "fee_installments",
  {
    ...baseColumns(),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id),
    name: text("name").notNull(),
    dueDate: date("due_date").notNull(),
    sharePercent: numeric("share_percent", { precision: 5, scale: 2, mode: "number" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  t => [
    uniqueIndex("fee_installments_structure_name_uq").on(t.feeStructureId, t.name),
    check("fee_installments_share_chk", sql`${t.sharePercent} > 0 AND ${t.sharePercent} <= 100`)
  ]
);

export const feeStructuresRelations = relations(feeStructures, ({ many, one }) => ({
  items: many(feeStructureItems),
  installments: many(feeInstallments),
  class: one(classes, { fields: [feeStructures.classId], references: [classes.id] })
}));

export const feeStructureItemsRelations = relations(feeStructureItems, ({ one }) => ({
  structure: one(feeStructures, { fields: [feeStructureItems.feeStructureId], references: [feeStructures.id] }),
  feeHead: one(feeHeads, { fields: [feeStructureItems.feeHeadId], references: [feeHeads.id] })
}));

export const feeInstallmentsRelations = relations(feeInstallments, ({ one }) => ({
  structure: one(feeStructures, { fields: [feeInstallments.feeStructureId], references: [feeStructures.id] })
}));
