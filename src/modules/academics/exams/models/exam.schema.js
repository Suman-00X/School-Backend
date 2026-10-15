import { relations, sql } from "drizzle-orm";
import { check, date, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { gradeScales } from "../../grading/models/gradeScale.schema.js";
import { EXAM_TYPES } from "../../shared/constants/academic.constants.js";

export const examType = pgEnum("exam_type", EXAM_TYPES);

/* An exam in an academic year (Mid Term, Final) */
export const exams = pgTable(
  "exams",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    examName: text("exam_name").notNull(),
    examType: examType("exam_type"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /* Grades use this scale, or the school's default scale when null */
    gradeScaleId: uuid("grade_scale_id").references(() => gradeScales.id),
    /* Students and parents see results only after publication */
    resultsPublishedAt: timestamp("results_published_at", { withTimezone: true }),
    description: text("description")
  },
  t => [
    uniqueIndex("exams_year_name_uq").on(t.academicYearId, t.examName),
    check("exams_dates_chk", sql`${t.startDate} IS NULL OR ${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`)
  ]
);

export const examsRelations = relations(exams, ({ one }) => ({
  gradeScale: one(gradeScales, { fields: [exams.gradeScaleId], references: [gradeScales.id] })
}));
