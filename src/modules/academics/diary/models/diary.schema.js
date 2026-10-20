import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { DIARY_ENTRY_KINDS } from "../constants/diary.constants.js";

export const diaryEntryKind = pgEnum("diary_entry_kind", DIARY_ENTRY_KINDS);

/* One line in a section's diary for a day, written by a teacher. With studentId it is a
   note to that student's family only; otherwise every family of the section reads it. */
export const diaryEntries = pgTable(
  "diary_entries",
  {
    ...baseColumns(),
    /* Archived years are read-only */
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    entryDate: date("entry_date").notNull(),
    kind: diaryEntryKind("kind").notNull(),
    /* Required for classwork and homework */
    subjectId: uuid("subject_id").references(() => subjects.id),
    /* A note to one family */
    studentId: uuid("student_id").references(() => students.id),
    body: text("body").notNull(),
    writtenBy: uuid("written_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    index("diary_entries_section_idx").on(t.tenantId, t.sectionId, t.entryDate),
    index("diary_entries_student_idx").on(t.tenantId, t.studentId, t.entryDate),
    check("diary_entries_subject_chk", sql`${t.kind} NOT IN ('CLASSWORK', 'HOMEWORK') OR ${t.subjectId} IS NOT NULL`),
    check("diary_entries_student_chk", sql`${t.studentId} IS NULL OR ${t.kind} = 'NOTE'`)
  ]
);

/* A parent's signature on a student's diary for a day, with an optional note back to the
   class teacher. Signing again replaces it (one per student and day). */
export const diarySignatures = pgTable(
  "diary_signatures",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The student's section when signed: whose teachers see it */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    entryDate: date("entry_date").notNull(),
    signedBy: uuid("signed_by")
      .notNull()
      .references(() => users.id),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    parentNote: text("parent_note")
  },
  t => [
    uniqueIndex("diary_signatures_active_uq").on(t.studentId, t.entryDate).where(activeRows(t)),
    index("diary_signatures_section_idx").on(t.tenantId, t.sectionId, t.entryDate)
  ]
);

export const diaryEntriesRelations = relations(diaryEntries, ({ one }) => ({
  subject: one(subjects, { fields: [diaryEntries.subjectId], references: [subjects.id] }),
  student: one(students, { fields: [diaryEntries.studentId], references: [students.id] }),
  writer: one(users, { fields: [diaryEntries.writtenBy], references: [users.id], relationName: "diaryWriter" })
}));

export const diarySignaturesRelations = relations(diarySignatures, ({ one }) => ({
  student: one(students, { fields: [diarySignatures.studentId], references: [students.id] }),
  signer: one(users, { fields: [diarySignatures.signedBy], references: [users.id], relationName: "diarySigner" })
}));
