import { relations } from "drizzle-orm";
import { date, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../accounts/models/user.schema.js";

export const students = pgTable(
  "students",
  {
    ...baseColumns(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    studentCode: text("student_code").notNull(),
    admissionNumber: text("admission_number").notNull(),
    admissionDate: date("admission_date"),
    bloodGroup: text("blood_group"),
    category: text("category"),
    religion: text("religion"),
    description: text("description")
  },
  t => [
    uniqueIndex("students_tenant_admission_number_uq").on(t.tenantId, t.admissionNumber),
    uniqueIndex("students_tenant_student_code_uq").on(t.tenantId, t.studentCode)
  ]
);

export const studentsRelations = relations(students, ({ one }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] })
}));
