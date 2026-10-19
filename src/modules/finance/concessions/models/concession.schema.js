import { relations, sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { CONCESSION_CATEGORIES, CONCESSION_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const concessionType = pgEnum("concession_type", CONCESSION_TYPES);
export const concessionCategory = pgEnum("concession_category", CONCESSION_CATEGORIES);

/* A discount template: Sibling 10%, Staff ward 50%, Merit ₹5,000 a year off tuition…
   PERCENT: 0–100 of each matching fee item. FIXED: an annual amount, spread over the
   student's installments (D-18). No fee heads = applies to every fee item. */
export const concessions = pgTable(
  "concessions",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    category: concessionCategory("category").notNull().default("OTHER"),
    concessionType: concessionType("concession_type").notNull(),
    value: money("value").notNull(),
    description: text("description")
  },
  t => [
    uniqueIndex("concessions_tenant_name_uq")
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(activeRows(t)),
    check("concessions_value_chk", sql`${t.value} > 0 AND (${t.concessionType} <> 'PERCENT' OR ${t.value} <= 100)`)
  ]
);

/* The fee heads a concession is limited to (replaced as a set) */
export const concessionFeeHeads = pgTable(
  "concession_fee_heads",
  {
    ...baseColumns(),
    concessionId: uuid("concession_id")
      .notNull()
      .references(() => concessions.id),
    feeHeadId: uuid("fee_head_id")
      .notNull()
      .references(() => feeHeads.id)
  },
  t => [uniqueIndex("concession_fee_heads_uq").on(t.concessionId, t.feeHeadId)]
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

export const concessionsRelations = relations(concessions, ({ many }) => ({
  feeHeads: many(concessionFeeHeads)
}));

export const concessionFeeHeadsRelations = relations(concessionFeeHeads, ({ one }) => ({
  concession: one(concessions, { fields: [concessionFeeHeads.concessionId], references: [concessions.id] }),
  feeHead: one(feeHeads, { fields: [concessionFeeHeads.feeHeadId], references: [feeHeads.id] })
}));

export const studentConcessionsRelations = relations(studentConcessions, ({ one }) => ({
  concession: one(concessions, { fields: [studentConcessions.concessionId], references: [concessions.id] }),
  student: one(students, { fields: [studentConcessions.studentId], references: [students.id] })
}));
