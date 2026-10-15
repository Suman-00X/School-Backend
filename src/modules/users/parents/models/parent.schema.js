import { relations } from "drizzle-orm";
import { numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../accounts/models/user.schema.js";

export const parents = pgTable(
  "parents",
  {
    ...baseColumns(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    parentCode: text("parent_code").notNull(),
    occupation: text("occupation"),
    annualIncome: numeric("annual_income", { precision: 12, scale: 2 }),
    description: text("description")
  },
  t => [uniqueIndex("parents_tenant_parent_code_uq").on(t.tenantId, t.parentCode)]
);

export const parentsRelations = relations(parents, ({ one }) => ({
  user: one(users, { fields: [parents.userId], references: [users.id] })
}));
