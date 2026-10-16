import { relations, sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { classes } from "../../classes/models/class.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { gradeScales } from "../../grading/models/gradeScale.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import {
  ABSENCE_TREATMENTS,
  GRADING_MODES,
  RANK_SCOPES,
  RANKING_METHODS,
  ROUNDING_MODES,
  SUBJECT_CATEGORIES
} from "../../shared/constants/academic.constants.js";

export const gradingMode = pgEnum("result_grading_mode", GRADING_MODES);
export const absenceTreatment = pgEnum("absence_treatment", ABSENCE_TREATMENTS);
export const rankingMethod = pgEnum("ranking_method", RANKING_METHODS);
export const rankScope = pgEnum("rank_scope", RANK_SCOPES);
export const roundingMode = pgEnum("rounding_mode", ROUNDING_MODES);
export const subjectCategory = pgEnum("subject_category", SUBJECT_CATEGORIES);

const percent = name => numeric(name, { precision: 5, scale: 2, mode: "number" });
const marks = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

/* How a school turns marks into results: grading system, pass criteria, grace,
   best-of-N, absences, ranking and rounding. Assigned per school (default),
   class and/or exam (result_policy_assignments). */
export const resultPolicies = pgTable(
  "result_policies",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),

    /* What the report shows: MARKS, GRADES (letter grades), GPA (grade points), PASS_FAIL */
    gradingMode: gradingMode("grading_mode").notNull().default("GRADES"),
    /* Bands for grades and grade points (else the exam's or the school's default scale) */
    gradeScaleId: uuid("grade_scale_id").references(() => gradeScales.id),
    /* Grades for co-scholastic and grade-only subjects (else the main scale) */
    coScholasticScaleId: uuid("co_scholastic_scale_id").references(() => gradeScales.id),
    /* Highest grade point: 4, 5, 10… (GPA mode) */
    gpaScale: numeric("gpa_scale", { precision: 4, scale: 2, mode: "number" }),

    /* Pass criteria, combinable */
    usePaperPassMarks: boolean("use_paper_pass_marks").notNull().default(true),
    subjectMinPercent: percent("subject_min_percent"),
    requirePassingGrade: boolean("require_passing_grade").notNull().default(true),
    requireComponentPass: boolean("require_component_pass").notNull().default(true),
    overallMinPercent: percent("overall_min_percent"),
    /* Up to this many failed subjects -> COMPARTMENT instead of FAIL (0 = never) */
    maxCompartmentSubjects: integer("max_compartment_subjects").notNull().default(0),

    /* Grace marks, only to turn a failed subject into a pass */
    graceMaxPerSubject: marks("grace_max_per_subject").notNull().default(0),
    graceMaxTotal: marks("grace_max_total").notNull().default(0),
    graceCountsInTotal: boolean("grace_counts_in_total").notNull().default(true),

    /* Best N scholastic subjects count toward the percentage (mandatory ones always) */
    bestOfSubjects: integer("best_of_subjects"),

    /* Per absence reason: zero and fail, or leave the paper out */
    absentTreatment: absenceTreatment("absent_treatment").notNull().default("ZERO_FAIL"),
    medicalTreatment: absenceTreatment("medical_treatment").notNull().default("ZERO_FAIL"),
    exemptTreatment: absenceTreatment("exempt_treatment").notNull().default("EXCLUDE"),

    rankingMethod: rankingMethod("ranking_method").notNull().default("COMPETITION"),
    rankScope: rankScope("rank_scope").notNull().default("SECTION"),
    rankFailedStudents: boolean("rank_failed_students").notNull().default(true),
    /* false: ranks are hidden from students and parents (CBSE-style) */
    showRankToStudents: boolean("show_rank_to_students").notNull().default(true),

    percentageDecimals: integer("percentage_decimals").notNull().default(2),
    gpaDecimals: integer("gpa_decimals").notNull().default(2),
    roundingMode: roundingMode("rounding_mode").notNull().default("HALF_UP")
  },
  t => [
    uniqueIndex("result_policies_tenant_name_uq").on(t.tenantId, t.name).where(activeRows(t)),
    uniqueIndex("result_policies_one_default_uq")
      .on(t.tenantId)
      .where(sql`${t.isDefault} = true AND ${t.isActive} = true`),
    check("result_policies_gpa_chk", sql`${t.gradingMode} <> 'GPA' OR ${t.gpaScale} IS NOT NULL`),
    check("result_policies_gpa_scale_chk", sql`${t.gpaScale} IS NULL OR (${t.gpaScale} > 0 AND ${t.gpaScale} <= 10)`),
    check(
      "result_policies_percent_chk",
      sql`(${t.subjectMinPercent} IS NULL OR ${t.subjectMinPercent} BETWEEN 0 AND 100)
        AND (${t.overallMinPercent} IS NULL OR ${t.overallMinPercent} BETWEEN 0 AND 100)`
    ),
    check(
      "result_policies_grace_chk",
      sql`${t.graceMaxPerSubject} >= 0 AND ${t.graceMaxTotal} >= 0 AND ${t.graceMaxPerSubject} <= ${t.graceMaxTotal}`
    ),
    check("result_policies_compartment_chk", sql`${t.maxCompartmentSubjects} >= 0`),
    check("result_policies_best_of_chk", sql`${t.bestOfSubjects} IS NULL OR ${t.bestOfSubjects} > 0`),
    check(
      "result_policies_decimals_chk",
      sql`${t.percentageDecimals} BETWEEN 0 AND 4 AND ${t.gpaDecimals} BETWEEN 0 AND 4`
    ),
    check("result_policies_pass_fail_rank_chk", sql`${t.gradingMode} <> 'PASS_FAIL' OR ${t.rankingMethod} = 'NONE'`)
  ]
);

/* Per-subject rules of a policy: credits (GPA), category, mandatory (best-of), own minimum % */
export const resultPolicySubjects = pgTable(
  "result_policy_subjects",
  {
    ...baseColumns(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => resultPolicies.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    category: subjectCategory("category").notNull().default("SCHOLASTIC"),
    credits: numeric("credits", { precision: 4, scale: 2, mode: "number" }).notNull().default(1),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    minPercent: percent("min_percent")
  },
  t => [
    uniqueIndex("result_policy_subjects_uq").on(t.policyId, t.subjectId),
    check("result_policy_subjects_credits_chk", sql`${t.credits} > 0`),
    check("result_policy_subjects_min_chk", sql`${t.minPercent} IS NULL OR ${t.minPercent} BETWEEN 0 AND 100`),
    check("result_policy_subjects_mandatory_chk", sql`NOT (${t.isMandatory} AND ${t.category} = 'CO_SCHOLASTIC')`)
  ]
);

/* Where a policy applies. Most specific wins: exam + class, exam, class, school default. */
export const resultPolicyAssignments = pgTable(
  "result_policy_assignments",
  {
    ...baseColumns(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => resultPolicies.id),
    examId: uuid("exam_id").references(() => exams.id),
    classId: uuid("class_id").references(() => classes.id)
  },
  t => [
    check("result_policy_assignments_target_chk", sql`${t.examId} IS NOT NULL OR ${t.classId} IS NOT NULL`),
    uniqueIndex("result_policy_assignments_exam_class_uq")
      .on(t.tenantId, t.examId, t.classId)
      .where(sql`${t.examId} IS NOT NULL AND ${t.classId} IS NOT NULL AND ${t.isActive} = true`),
    uniqueIndex("result_policy_assignments_exam_uq")
      .on(t.tenantId, t.examId)
      .where(sql`${t.classId} IS NULL AND ${t.isActive} = true`),
    uniqueIndex("result_policy_assignments_class_uq")
      .on(t.tenantId, t.classId)
      .where(sql`${t.examId} IS NULL AND ${t.isActive} = true`)
  ]
);

export const resultPoliciesRelations = relations(resultPolicies, ({ one, many }) => ({
  subjects: many(resultPolicySubjects),
  gradeScale: one(gradeScales, { fields: [resultPolicies.gradeScaleId], references: [gradeScales.id] })
}));

export const resultPolicySubjectsRelations = relations(resultPolicySubjects, ({ one }) => ({
  policy: one(resultPolicies, { fields: [resultPolicySubjects.policyId], references: [resultPolicies.id] }),
  subject: one(subjects, { fields: [resultPolicySubjects.subjectId], references: [subjects.id] })
}));

export const resultPolicyAssignmentsRelations = relations(resultPolicyAssignments, ({ one }) => ({
  policy: one(resultPolicies, { fields: [resultPolicyAssignments.policyId], references: [resultPolicies.id] }),
  exam: one(exams, { fields: [resultPolicyAssignments.examId], references: [exams.id] }),
  class: one(classes, { fields: [resultPolicyAssignments.classId], references: [classes.id] })
}));
