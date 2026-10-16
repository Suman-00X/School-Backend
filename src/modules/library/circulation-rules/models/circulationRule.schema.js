import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { classes } from "../../../academics/classes/models/class.schema.js";
import { userRole } from "../../../users/accounts/models/user.schema.js";
import { libraryItemType } from "../../books/models/book.schema.js";
import { money } from "../../shared/models/money.columns.js";

/* Lending terms for a borrower category and an item type. Empty columns match
   anything: (STUDENT, -, -) is every student and item; (STUDENT, Class 1, MEDIA)
   is Class 1 students borrowing media. The most specific rule applies (class,
   then role, then item type). Terms are copied onto each loan at issue. */
export const libraryCirculationRules = pgTable(
  "library_circulation_rules",
  {
    ...baseColumns(),
    /* null: any borrower */
    borrowerRole: userRole("borrower_role"),
    /* Students of one class only */
    classId: uuid("class_id").references(() => classes.id),
    /* null: any item type */
    itemType: libraryItemType("item_type"),
    loanDays: integer("loan_days").notNull(),
    /* Open loans at once, counted within the rule's item type (all items when empty) */
    maxLoans: integer("max_loans").notNull(),
    maxRenewals: integer("max_renewals").notNull(),
    finePerDay: money("fine_per_day").notNull(),
    fineGraceDays: integer("fine_grace_days").notNull().default(0),
    /* Cap on one loan's late fine (null: the copy's price, when the policy caps at price) */
    maxFine: money("max_fine")
  },
  t => [
    /* One rule per (role, class, item type), empty columns included: one partial index
       per combination of empty columns (enum casts are not immutable, so no coalesce;
       a class implies a role) */
    uniqueIndex("library_circulation_rules_role_type_uq")
      .on(t.tenantId, t.borrowerRole, sql`coalesce(${t.classId}::text, '')`, t.itemType)
      .where(sql`${activeRows(t)} AND ${t.borrowerRole} IS NOT NULL AND ${t.itemType} IS NOT NULL`),
    uniqueIndex("library_circulation_rules_role_uq")
      .on(t.tenantId, t.borrowerRole, sql`coalesce(${t.classId}::text, '')`)
      .where(sql`${activeRows(t)} AND ${t.borrowerRole} IS NOT NULL AND ${t.itemType} IS NULL`),
    uniqueIndex("library_circulation_rules_type_uq")
      .on(t.tenantId, t.itemType)
      .where(sql`${activeRows(t)} AND ${t.borrowerRole} IS NULL AND ${t.itemType} IS NOT NULL`),
    uniqueIndex("library_circulation_rules_any_uq")
      .on(t.tenantId)
      .where(sql`${activeRows(t)} AND ${t.borrowerRole} IS NULL AND ${t.itemType} IS NULL`),
    index("library_circulation_rules_class_idx").on(t.classId),
    check("library_circulation_rules_class_chk", sql`${t.classId} IS NULL OR ${t.borrowerRole} = 'STUDENT'`),
    check("library_circulation_rules_type_chk", sql`${t.itemType} IS NULL OR ${t.itemType} <> 'REFERENCE'`),
    check(
      "library_circulation_rules_terms_chk",
      sql`${t.loanDays} BETWEEN 1 AND 365 AND ${t.maxLoans} >= 0 AND ${t.maxRenewals} >= 0 AND ${t.finePerDay} >= 0 AND ${t.fineGraceDays} >= 0 AND (${t.maxFine} IS NULL OR ${t.maxFine} >= 0)`
    )
  ]
);

export const libraryCirculationRulesRelations = relations(libraryCirculationRules, ({ one }) => ({
  class: one(classes, { fields: [libraryCirculationRules.classId], references: [classes.id] })
}));
