import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { ADMIT_CARD_STATUSES } from "../../shared/constants/academic.constants.js";

export const admitCardStatus = pgEnum("admit_card_status", ADMIT_CARD_STATUSES);

/* A student's admit card for one exam: issued when they meet the exam eligibility rules
   (or are exempted). `details` is what the card prints, frozen when it was last generated:
   { student: { firstName, lastName, admissionNumber, rollNumber, section },
     exam: { examName, startDate, endDate }, papers: [{ subjectName, component, displayCode,
     examDate, startTime, endTime, room }] }. Generating again refreshes it. */
export const admitCards = pgTable(
  "admit_cards",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    status: admitCardStatus("status").notNull().default("ISSUED"),
    details: jsonb("details").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    /* Why the student no longer qualifies, as judged then */
    withdrawnReason: text("withdrawn_reason")
  },
  t => [
    uniqueIndex("admit_cards_exam_student_uq").on(t.examId, t.studentId).where(activeRows(t)),
    index("admit_cards_student_idx").on(t.studentId, t.academicYearId)
  ]
);

export const admitCardsRelations = relations(admitCards, ({ one }) => ({
  exam: one(exams, { fields: [admitCards.examId], references: [exams.id] })
}));
