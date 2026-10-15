import { relations, sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { CONCESSION_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const concessionType = pgEnum("concession_type", CONCESSION_TYPES);

/* A discount rule: Sibling 10%, Staff ward 50%, Merit ₹5,000 off tuition…
   feeHeadId null = applies to every fee line. */
export const concessions = pgTable(
  "concessions",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    concessionType: concessionType("concession_type").notNull(),
    /* PERCENT: 0–100. FIXED: amount off each matching line of each invoice */
    value: money("value").notNull(),
    feeHeadId: uuid("fee_head_id").references(() => feeHeads.id),
    description: text("description")
  },
  t => [
    uniqueIndex("concessions_tenant_name_uq")
      .on(t.tenantId, t.name)
      .where(sql`${t.isActive} = true`),
    check("concessions_value_chk", sql`${t.value} > 0 AND (${t.concessionType} <> 'PERCENT' OR ${t.value} <= 100)`)
  ]
);

/* A concession granted to a student for an academic year */
export const studentConcessions = pgTable(
  "student_concessions",
  {
    ...baseColumns(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    concessionId: uuid("concession_id")
      .notNull()
      .references(() => concessions.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    reason: text("reason"),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    uniqueIndex("student_concessions_active_uq")
      .on(t.studentId, t.concessionId, t.academicYearId)
      .where(sql`${t.isActive} = true`)
  ]
);

export const studentConcessionsRelations = relations(studentConcessions, ({ one }) => ({
  concession: one(concessions, { fields: [studentConcessions.concessionId], references: [concessions.id] })
}));
