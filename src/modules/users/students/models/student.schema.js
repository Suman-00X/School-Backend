import { relations, sql } from "drizzle-orm";
import { date, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../accounts/models/user.schema.js";

export const students = pgTable(
  "students",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    studentCode: text("student_code").notNull(),
    admissionNumber: text("admission_number").notNull(),
    admissionDate: date("admission_date"),
    bloodGroup: text("blood_group"),
    category: text("category"),
    religion: text("religion"),
    /* National ids (NEP 2020): the UDISE+ Permanent Education Number (11 digits) and the
       APAAR id ("One Nation One Student ID", 12 digits), with the date the parents consented */
    pen: text("pen"),
    apaarId: text("apaar_id"),
    apaarConsentOn: date("apaar_consent_on"),
    motherTongue: text("mother_tongue"),
    description: text("description")
  },
  t => [
    uniqueIndex("students_tenant_admission_number_uq").on(t.tenantId, t.admissionNumber),
    uniqueIndex("students_tenant_student_code_uq").on(t.tenantId, t.studentCode),
    uniqueIndex("students_tenant_pen_uq")
      .on(t.tenantId, t.pen)
      .where(sql`${t.pen} IS NOT NULL`),
    uniqueIndex("students_tenant_apaar_id_uq")
      .on(t.tenantId, t.apaarId)
      .where(sql`${t.apaarId} IS NOT NULL`)
  ]
);

export const studentsRelations = relations(students, ({ one }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] })
}));
