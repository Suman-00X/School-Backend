import { asc, eq, isNull, or, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { libraryCirculationRules as rules } from "../models/circulationRule.schema.js";

const base = createRepository({
  table: rules,
  queryKey: "libraryCirculationRules",
  /* Most general first: everyone, then roles, then classes */
  orderBy: [
    sql`${rules.borrowerRole} NULLS FIRST`,
    sql`${rules.classId} NULLS FIRST`,
    sql`${rules.itemType} NULLS FIRST`,
    asc(rules.createdAt)
  ]
});

/* Exactly this value (both empty included) / this value or "any" */
const same = (column, value) => (value ? eq(column, value) : isNull(column));
const covers = (column, value) => (value ? or(isNull(column), eq(column, value)) : isNull(column));

export const circulationRuleRepository = {
  ...base,

  /* The rule with exactly this scope */
  scopeConditions: ({ borrowerRole, classId, itemType }) => [
    same(rules.borrowerRole, borrowerRole),
    same(rules.classId, classId),
    same(rules.itemType, itemType)
  ],

  /* Every rule that covers a borrower (role, class) and an item type;
     itemType null: only the rules for any item type */
  findCovering: (tenantId, { role, classId }, itemType, options) =>
    base.findMany(tenantId, {
      ...options,
      conditions: [covers(rules.borrowerRole, role), covers(rules.classId, classId), covers(rules.itemType, itemType)]
    })
};
