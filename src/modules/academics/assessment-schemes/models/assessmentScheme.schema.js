import { relations, sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { resultPolicies } from "../../result-policies/models/resultPolicy.schema.js";

/* A term or annual result that combines exams with weights
   (Term 1 40% + Term 2 60%; periodic tests 10% + half-yearly 30% + annual 60%) */
export const assessmentSchemes = pgTable(
  "assessment_schemes",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    name: text("name").notNull(),
    description: text("description"),
    /* Own policy; else the class's, the school default or the built-in rules */
    policyId: uuid("policy_id").references(() => resultPolicies.id),
    resultsPublishedAt: timestamp("results_published_at", { withTimezone: true })
  },
  t => [uniqueIndex("assessment_schemes_year_name_uq").on(t.tenantId, t.academicYearId, t.name).where(activeRows(t))]
);

/* An exam in a scheme and its weight (a scheme's weights sum to 100) */
export const assessmentSchemeExams = pgTable(
  "assessment_scheme_exams",
  {
    ...baseColumns(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => assessmentSchemes.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    weight: numeric("weight", { precision: 5, scale: 2, mode: "number" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  t => [
    uniqueIndex("assessment_scheme_exams_uq").on(t.schemeId, t.examId),
    check("assessment_scheme_exams_weight_chk", sql`${t.weight} > 0 AND ${t.weight} <= 100`)
  ]
);

export const assessmentSchemesRelations = relations(assessmentSchemes, ({ one, many }) => ({
  exams: many(assessmentSchemeExams),
  policy: one(resultPolicies, { fields: [assessmentSchemes.policyId], references: [resultPolicies.id] })
}));

export const assessmentSchemeExamsRelations = relations(assessmentSchemeExams, ({ one }) => ({
  scheme: one(assessmentSchemes, { fields: [assessmentSchemeExams.schemeId], references: [assessmentSchemes.id] }),
  exam: one(exams, { fields: [assessmentSchemeExams.examId], references: [exams.id] })
}));
