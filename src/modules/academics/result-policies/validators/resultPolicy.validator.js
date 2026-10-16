import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import {
  ABSENCE_TREATMENTS,
  GRADING_MODES,
  RANK_SCOPES,
  RANKING_METHODS,
  ROUNDING_MODES,
  SUBJECT_CATEGORIES
} from "../../shared/constants/academic.constants.js";

const percent = () => z.number().min(0).max(100);
const graceMarks = () => z.number().min(0).max(100);
const decimals = () => z.number().int().min(0).max(4);

const subjectRule = z
  .object({
    subjectId: id(),
    category: z.enum(SUBJECT_CATEGORIES).default("SCHOLASTIC"),
    /* Weight of the subject in a credit-weighted GPA */
    credits: z.number().positive().max(99).default(1),
    /* Always counted when only the best N subjects count */
    isMandatory: z.boolean().default(false),
    /* This subject's own minimum %, instead of the policy's */
    minPercent: percent().nullable().optional()
  })
  .refine(rule => !(rule.isMandatory && rule.category === "CO_SCHOLASTIC"), {
    path: ["isMandatory"],
    message: "cannot be true for a co-scholastic subject (it never counts toward the result)"
  });

/* Every setting of a policy; omitted ones keep the built-in default (today's rules) */
const settings = z.object({
  gradingMode: z.enum(GRADING_MODES).optional(),
  gradeScaleId: id().nullable().optional(),
  coScholasticScaleId: id().nullable().optional(),
  gpaScale: z.number().positive().max(10).nullable().optional(),
  usePaperPassMarks: z.boolean().optional(),
  subjectMinPercent: percent().nullable().optional(),
  requirePassingGrade: z.boolean().optional(),
  requireComponentPass: z.boolean().optional(),
  overallMinPercent: percent().nullable().optional(),
  maxCompartmentSubjects: z.number().int().min(0).max(20).optional(),
  graceMaxPerSubject: graceMarks().optional(),
  graceMaxTotal: graceMarks().optional(),
  graceCountsInTotal: z.boolean().optional(),
  bestOfSubjects: z.number().int().min(1).max(30).nullable().optional(),
  absentTreatment: z.enum(ABSENCE_TREATMENTS).optional(),
  medicalTreatment: z.enum(ABSENCE_TREATMENTS).optional(),
  exemptTreatment: z.enum(ABSENCE_TREATMENTS).optional(),
  rankingMethod: z.enum(RANKING_METHODS).optional(),
  rankScope: z.enum(RANK_SCOPES).optional(),
  rankFailedStudents: z.boolean().optional(),
  showRankToStudents: z.boolean().optional(),
  percentageDecimals: decimals().optional(),
  gpaDecimals: decimals().optional(),
  roundingMode: z.enum(ROUNDING_MODES).optional(),
  subjects: z
    .array(subjectRule)
    .max(60)
    .refine(rules => new Set(rules.map(r => r.subjectId)).size === rules.length, "must not repeat a subject")
    .optional()
});

const fields = settings.extend({
  name: text(100),
  description: optionalText(),
  isDefault: z.boolean().optional()
});

/* Rules a body can break on its own (400); rules needing the database are checked by the service (422) */
const consistent = schema =>
  schema
    .refine(p => p.gradingMode !== "GPA" || (p.gpaScale !== undefined && p.gpaScale !== null), {
      path: ["gpaScale"],
      message: "is required for a GPA policy (the highest grade point, e.g. 4, 5 or 10)"
    })
    .refine(
      p =>
        p.graceMaxPerSubject === undefined || p.graceMaxTotal === undefined || p.graceMaxPerSubject <= p.graceMaxTotal,
      { path: ["graceMaxPerSubject"], message: "cannot exceed graceMaxTotal" }
    )
    .refine(p => p.gradingMode !== "PASS_FAIL" || !p.rankingMethod || p.rankingMethod === "NONE", {
      path: ["rankingMethod"],
      message: "must be NONE for a pass/fail policy"
    });

const params = idParams("policyId");

export const policySettings = consistent(settings.extend({ name: text(100).optional() }));

export const resultPolicyValidators = {
  create: { body: consistent(fields) },
  list: { query: listQuery({ gradingMode: z.enum(GRADING_MODES).optional() }) },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params },
  resolution: {
    query: z
      .object({ examId: id().optional(), classId: id().optional(), sectionId: id().optional() })
      .refine(q => q.examId || q.classId || q.sectionId, {
        path: ["examId"],
        message: "send examId, classId or sectionId"
      })
  },

  /* /result-policy-assignments */
  createAssignment: {
    body: z
      .object({ policyId: id(), examId: id().optional(), classId: id().optional() })
      .refine(body => body.examId || body.classId, {
        path: ["examId"],
        message: "send examId, classId or both (the school default is the policy's isDefault)"
      })
  },
  listAssignments: {
    query: listQuery({ policyId: id().optional(), examId: id().optional(), classId: id().optional() })
  },
  assignment: { params: idParams("assignmentId") },
  updateAssignment: { params: idParams("assignmentId"), body: z.object({ policyId: id() }) }
};
