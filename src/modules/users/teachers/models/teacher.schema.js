import { relations } from "drizzle-orm";
import { date, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../accounts/models/user.schema.js";
import { employmentType } from "../../shared/models/employment.schema.js";

export const teachers = pgTable(
  "teachers",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    employeeCode: text("employee_code").notNull(),
    qualification: text("qualification"),
    experienceYears: integer("experience_years"),
    joiningDate: date("joining_date"),
    employmentType: employmentType("employment_type"),
    bloodGroup: text("blood_group"),
    description: text("description")
  },
  t => [uniqueIndex("teachers_tenant_employee_code_uq").on(t.tenantId, t.employeeCode)]
);

export const teachersRelations = relations(teachers, ({ one }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] })
}));
