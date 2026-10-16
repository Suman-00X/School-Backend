import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { gradingService } from "../../grading/index.js";
import { exams } from "../models/exam.schema.js";
import { examRepository } from "../repositories/exam.repository.js";

export const EXAM_RESULTS_PUBLISHED = "academics.exam.resultsPublished";

const base = createCrudService(examRepository, { entity: "Exam" });

const assertScale = async (ctx, gradeScaleId) => {
  if (gradeScaleId && !(await gradingService.exists(ctx, gradeScaleId))) {
    throw unprocessable("gradeScaleId does not refer to an existing grade scale");
  }
};

export const examService = {
  getById: base.getById,

  /* Year-scoped (ctx.academicYearId from resolveAcademicYear) */
  list: (ctx, { page, limit }) => base.list(ctx, { page, limit }, [eq(exams.academicYearId, ctx.academicYearId)]),

  create: async (ctx, data) => {
    await assertScale(ctx, data.gradeScaleId);
    return examRepository.create(ctx.tenantId, { ...data, academicYearId: ctx.academicYearId });
  },

  createMany: (ctx, items) =>
    examRepository.createMany(
      ctx.tenantId,
      items.map(item => ({ ...item, academicYearId: ctx.academicYearId }))
    ),

  update: async (ctx, examId, data) => {
    await assertScale(ctx, data.gradeScaleId);
    return base.update(ctx, examId, data);
  },

  /* For other submodules: null when missing */
  findById: (ctx, examId) => examRepository.findById(ctx.tenantId, examId),

  findInYear: (ctx, academicYearId) =>
    examRepository.findMany(ctx.tenantId, { conditions: [eq(exams.academicYearId, academicYearId)] }),

  /* Result publication (report-cards) runs inside its own transaction: lock, then flip visibility */
  lockForUpdate: (ctx, examId, { dbc }) => examRepository.lockForUpdate(ctx.tenantId, examId, { dbc }),

  setResultsPublishedAt: (ctx, examId, publishedAt, { dbc }) =>
    examRepository.update(ctx.tenantId, examId, { resultsPublishedAt: publishedAt }, { dbc })
};
