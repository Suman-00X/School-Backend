import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { SUBSTITUTION_KINDS } from "../../shared/constants/academic.constants.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { periods } from "../../timetable/models/period.schema.js";
import { timetableSlots } from "../../timetable/models/timetableSlot.schema.js";

export const substitutionKind = pgEnum("substitution_kind", SUBSTITUTION_KINDS);

/* How one lesson of an absent teacher is covered on one date. A lesson with no row is a
   leisure period, as is one planned LEISURE. Section, period and the absent teacher are
   copied from the lesson when it is planned (the timetable may change later). Cancelling
   sets is_active = false. */
export const substitutions = pgTable(
  "substitutions",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    date: date("date").notNull(),
    timetableSlotId: uuid("timetable_slot_id")
      .notNull()
      .references(() => timetableSlots.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id),
    absentTeacherId: uuid("absent_teacher_id")
      .notNull()
      .references(() => teachers.id),
    kind: substitutionKind("kind").notNull(),
    /* SUBSTITUTE: who takes the class; ACTIVITY: the teacher in charge (optional) */
    substituteTeacherId: uuid("substitute_teacher_id").references(() => teachers.id),
    /* SUBSTITUTE: the subject they take (the lesson's own when null) */
    subjectId: uuid("subject_id").references(() => subjects.id),
    /* ACTIVITY: "Library", "Games", "Quiz" … */
    activity: text("activity"),
    note: text("note"),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    uniqueIndex("substitutions_slot_date_uq").on(t.timetableSlotId, t.date).where(activeRows(t)),
    /* A teacher covers one class at a time */
    uniqueIndex("substitutions_teacher_date_period_uq")
      .on(t.substituteTeacherId, t.date, t.periodId)
      .where(sql`${t.isActive} = true AND ${t.substituteTeacherId} IS NOT NULL`),
    index("substitutions_date_idx").on(t.tenantId, t.date),
    check(
      "substitutions_kind_chk",
      sql`CASE ${t.kind}
        WHEN 'SUBSTITUTE' THEN ${t.substituteTeacherId} IS NOT NULL AND ${t.activity} IS NULL
        WHEN 'ACTIVITY' THEN ${t.activity} IS NOT NULL AND ${t.subjectId} IS NULL
        ELSE ${t.substituteTeacherId} IS NULL AND ${t.subjectId} IS NULL AND ${t.activity} IS NULL
      END`
    ),
    check(
      "substitutions_not_self_chk",
      sql`${t.substituteTeacherId} IS NULL OR ${t.substituteTeacherId} <> ${t.absentTeacherId}`
    )
  ]
);

export const substitutionsRelations = relations(substitutions, ({ one }) => ({
  section: one(sections, { fields: [substitutions.sectionId], references: [sections.id] }),
  period: one(periods, { fields: [substitutions.periodId], references: [periods.id] }),
  slot: one(timetableSlots, { fields: [substitutions.timetableSlotId], references: [timetableSlots.id] }),
  subject: one(subjects, { fields: [substitutions.subjectId], references: [subjects.id] }),
  absentTeacher: one(teachers, {
    fields: [substitutions.absentTeacherId],
    references: [teachers.id],
    relationName: "substitutionAbsentTeacher"
  }),
  substituteTeacher: one(teachers, {
    fields: [substitutions.substituteTeacherId],
    references: [teachers.id],
    relationName: "substitutionSubstituteTeacher"
  })
}));
