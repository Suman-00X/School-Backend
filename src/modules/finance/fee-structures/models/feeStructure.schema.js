import { relations, sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { classes } from "../../../academics/classes/models/class.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { installmentPlans } from "../../installment-plans/models/installmentPlan.schema.js";
import { lateFeeRules } from "../../late-fee-rules/models/lateFeeRule.schema.js";
import { money } from "../../shared/models/money.columns.js";

/* What a class pays in an academic year (annual amounts per fee head), which
   installment plans it may be paid by, and its late-fee rule.
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
    /* false = never charges late fees. true with no rule = the school's default rule */
    chargesLateFee: boolean("charges_late_fee").notNull().default(true),
    lateFeeRuleId: uuid("late_fee_rule_id").references(() => lateFeeRules.id)
  },
  t => [
    uniqueIndex("fee_structures_year_class_name_uq")
      .on(t.academicYearId, t.classId, sql`lower(${t.name})`)
      .where(sql`${t.isActive} = true`),
    check("fee_structures_late_fee_chk", sql`${t.chargesLateFee} OR ${t.lateFeeRuleId} IS NULL`)
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

/* The installment plans a structure can be paid by; exactly one is its default */
export const feeStructurePlans = pgTable(
  "fee_structure_plans",
  {
    ...baseColumns(),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id),
    installmentPlanId: uuid("installment_plan_id")
      .notNull()
      .references(() => installmentPlans.id),
    isDefault: boolean("is_default").notNull().default(false)
  },
  t => [
    uniqueIndex("fee_structure_plans_plan_uq").on(t.feeStructureId, t.installmentPlanId),
    uniqueIndex("fee_structure_plans_default_uq")
      .on(t.feeStructureId)
      .where(sql`${t.isDefault} = true`)
  ]
);

export const feeStructuresRelations = relations(feeStructures, ({ many, one }) => ({
  items: many(feeStructureItems),
  plans: many(feeStructurePlans),
  class: one(classes, { fields: [feeStructures.classId], references: [classes.id] }),
  lateFeeRule: one(lateFeeRules, { fields: [feeStructures.lateFeeRuleId], references: [lateFeeRules.id] })
}));

export const feeStructureItemsRelations = relations(feeStructureItems, ({ one }) => ({
  structure: one(feeStructures, { fields: [feeStructureItems.feeStructureId], references: [feeStructures.id] }),
  feeHead: one(feeHeads, { fields: [feeStructureItems.feeHeadId], references: [feeHeads.id] })
}));

export const feeStructurePlansRelations = relations(feeStructurePlans, ({ one }) => ({
  structure: one(feeStructures, { fields: [feeStructurePlans.feeStructureId], references: [feeStructures.id] }),
  plan: one(installmentPlans, { fields: [feeStructurePlans.installmentPlanId], references: [installmentPlans.id] })
}));
