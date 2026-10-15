import { relations } from "drizzle-orm";
import { date, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../accounts/models/user.schema.js";
import { employmentType } from "../../shared/models/employment.schema.js";

/* Profile of a privileged, non-teaching user (ADMIN, PRINCIPAL, ACCOUNTANT, STAFF) */
export const staffMembers = pgTable(
  "staff_members",
  {
    ...baseColumns(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    employeeCode: text("employee_code").notNull(),
    designation: text("designation"),
    department: text("department"),
    qualification: text("qualification"),
    joiningDate: date("joining_date"),
    employmentType: employmentType("employment_type"),
    bloodGroup: text("blood_group"),
    description: text("description")
  },
  t => [uniqueIndex("staff_members_tenant_employee_code_uq").on(t.tenantId, t.employeeCode)]
);

export const staffMembersRelations = relations(staffMembers, ({ one }) => ({
  user: one(users, { fields: [staffMembers.userId], references: [users.id] })
}));
