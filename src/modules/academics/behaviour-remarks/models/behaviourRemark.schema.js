import { relations } from "drizzle-orm";
import { date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { REMARK_KINDS } from "../constants/behaviourRemark.constants.js";

export const behaviourRemarkKind = pgEnum("behaviour_remark_kind", REMARK_KINDS);

/* One entry in a student's behaviour log book: written by a teacher (or the office),
   read by the student's teachers, the student and their parents. A parent acknowledges
   it, like signing the school diary; editing the entry asks for that again. */
export const behaviourRemarks = pgTable(
  "behaviour_remarks",
  {
    ...baseColumns(),
    /* The year it happened in (archived years are read-only) */
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The student's section when it was recorded: decides which teachers see it */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    occurredOn: date("occurred_on").notNull(),
    kind: behaviourRemarkKind("kind").notNull(),
    category: text("category").notNull(),
    remark: text("remark").notNull(),
    /* What was done about it: parents called, detention, a word with the counsellor… */
    actionTaken: text("action_taken"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id)
  },
  t => [
    index("behaviour_remarks_student_idx").on(t.tenantId, t.studentId, t.occurredOn),
    index("behaviour_remarks_section_idx").on(t.tenantId, t.sectionId, t.occurredOn)
  ]
);

export const behaviourRemarksRelations = relations(behaviourRemarks, ({ one }) => ({
  student: one(students, { fields: [behaviourRemarks.studentId], references: [students.id] }),
  recorder: one(users, { fields: [behaviourRemarks.recordedBy], references: [users.id], relationName: "behaviourRecorder" }),
  acknowledger: one(users, {
    fields: [behaviourRemarks.acknowledgedBy],
    references: [users.id],
    relationName: "behaviourAcknowledger"
  })
}));
