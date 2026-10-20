import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { exams } from "../../exams/models/exam.schema.js";

/* One per school (created with defaults on first read): who may sit an exam. A student
   sits it (gets an admit card) only when every rule switched on is met:
   - attendance: at least `min_attendance_percentage` from the start of the year
   - dues: at most `max_overdue_amount` of fees past their due date (0: everything paid)
   Both rules are off by default, so every student is eligible until the school sets them. */
export const examEligibilityPolicies = pgTable(
  "exam_eligibility_policies",
  {
    ...baseColumns(),
    attendanceRuleEnabled: boolean("attendance_rule_enabled").notNull().default(false),
    minAttendancePercentage: integer("min_attendance_percentage").notNull().default(75),
    duesRuleEnabled: boolean("dues_rule_enabled").notNull().default(false),
    maxOverdueAmount: numeric("max_overdue_amount", { precision: 12, scale: 2, mode: "number" }).notNull().default(0)
  },
  t => [
    uniqueIndex("exam_eligibility_policies_tenant_uq").on(t.tenantId),
    check("exam_eligibility_policies_attendance_chk", sql`${t.minAttendancePercentage} BETWEEN 1 AND 100`),
    check("exam_eligibility_policies_dues_chk", sql`${t.maxOverdueAmount} >= 0`)
  ]
);

/* A student allowed to sit one exam although a rule is not met (a medical case, a fee
   arrangement), with the reason. Removing it puts the rules back in force for them. */
export const examEligibilityExemptions = pgTable(
  "exam_eligibility_exemptions",
  {
    ...baseColumns(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    reason: text("reason").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id)
  },
  t => [
    uniqueIndex("exam_eligibility_exemptions_exam_student_uq").on(t.examId, t.studentId).where(activeRows(t)),
    index("exam_eligibility_exemptions_exam_idx").on(t.examId)
  ]
);

export const examEligibilityExemptionsRelations = relations(examEligibilityExemptions, ({ one }) => ({
  grantor: one(users, { fields: [examEligibilityExemptions.grantedBy], references: [users.id] })
}));
