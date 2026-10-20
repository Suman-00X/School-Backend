import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { publish } from "../../../../common/events/events.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { admitCardService } from "../../admit-cards/index.js";
import { examEligibilityService } from "../../exam-eligibility/index.js";
import { gradingService } from "../../grading/index.js";
import { marksService } from "../../marks/index.js";
import { resultPolicyService } from "../../result-policies/index.js";
import { exams } from "../models/exam.schema.js";
import { examPapers } from "../models/examPaper.schema.js";
import { examPaperRepository } from "../repositories/examPaper.repository.js";
import { examRepository } from "../repositories/exam.repository.js";

export const EXAM_RESULTS_PUBLISHED = "academics.exam.resultsPublished";
/* A paper was scheduled, rescheduled or removed, or the exam was removed: the calendar's
   exam event follows ({ tenantId, examId }) */
export const EXAM_SCHEDULE_CHANGED = "academics.exam.scheduleChanged";

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

  /* Only an exam nothing depends on yet: no published results, no marks, in no assessment scheme.
     Its papers, exam-specific result policy assignments, admit cards and eligibility exemptions go with it. */
  remove: async (ctx, examId) => {
    const exam = await base.getById(ctx, examId);
    if (exam.resultsPublishedAt) {
      throw conflict(`${exam.examName} has published results. Withdraw them before removing the exam.`);
    }
    if (await marksService.hasMarksForExam(ctx, examId)) {
      throw conflict(`${exam.examName} already has recorded marks and cannot be removed`);
    }
    const schemes = await examRepository.schemeNames(ctx.tenantId, examId);
    if (schemes.length) {
      throw conflict(`${exam.examName} is part of ${schemes.join(", ")}. Take it out of the scheme before removing the exam.`);
    }
    await transaction(async tx => {
      await examPaperRepository.softDeleteWhere(ctx.tenantId, [eq(examPapers.examId, examId)], { dbc: tx });
      await resultPolicyService.releaseExam(ctx, examId, { dbc: tx });
      await admitCardService.releaseExam(ctx, examId, { dbc: tx });
      await examEligibilityService.releaseExam(ctx, examId, { dbc: tx });
      await examRepository.softDelete(ctx.tenantId, examId, { dbc: tx });
    });
    await publish(EXAM_SCHEDULE_CHANGED, { tenantId: ctx.tenantId, examId });
    return exam;
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
