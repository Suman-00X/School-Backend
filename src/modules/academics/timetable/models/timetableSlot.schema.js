import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { periods } from "./period.schema.js";

/* One weekly class: section × weekday × period -> subject, teacher, room.
   Clashes are impossible by construction (partial unique indexes). */
export const timetableSlots = pgTable(
  "timetable_slots",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    /* ISO weekday: 1 = Monday … 7 = Sunday */
    weekday: integer("weekday").notNull(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id),
    room: text("room")
  },
  t => [
    uniqueIndex("timetable_slots_section_uq").on(t.sectionId, t.weekday, t.periodId).where(activeRows(t)),
    uniqueIndex("timetable_slots_teacher_uq").on(t.teacherId, t.weekday, t.periodId).where(activeRows(t)),
    uniqueIndex("timetable_slots_room_uq")
      .on(t.academicYearId, t.room, t.weekday, t.periodId)
      .where(sql`${t.isActive} = true AND ${t.room} IS NOT NULL`),
    check("timetable_slots_weekday_chk", sql`${t.weekday} BETWEEN 1 AND 7`)
  ]
);

export const timetableSlotsRelations = relations(timetableSlots, ({ one }) => ({
  section: one(sections, { fields: [timetableSlots.sectionId], references: [sections.id] }),
  period: one(periods, { fields: [timetableSlots.periodId], references: [periods.id] }),
  subject: one(subjects, { fields: [timetableSlots.subjectId], references: [subjects.id] }),
  teacher: one(teachers, { fields: [timetableSlots.teacherId], references: [teachers.id] })
}));
