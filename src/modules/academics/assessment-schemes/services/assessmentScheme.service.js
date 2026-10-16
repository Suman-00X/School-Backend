import { asc, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { examService } from "../../exams/index.js";
import { resultPolicyService } from "../../result-policies/index.js";
import { assessmentSchemeExams, assessmentSchemes } from "../models/assessmentScheme.schema.js";
import { assessmentSchemeRepository } from "../repositories/assessmentScheme.repository.js";

const withExams = {
  exams: {
    orderBy: [asc(assessmentSchemeExams.sortOrder)],
    with: { exam: { columns: { id: true, examName: true, examType: true, startDate: true, endDate: true } } }
  },
  policy: { columns: { id: true, name: true, gradingMode: true } }
};

/* "Term 1 40% + Term 2 60%" */
export const weightsLabel = scheme => scheme.exams.map(e => `${e.exam.examName} ${e.weight}%`).join(" + ");

const load = async (ctx, schemeId) => {
  const scheme = await assessmentSchemeRepository.findById(ctx.tenantId, schemeId, { with: withExams });
  if (!scheme) throw notFound("Assessment scheme");
  return scheme;
};

const assertReferences = async (ctx, academicYearId, { policyId, exams }) => {
  if (policyId && !(await resultPolicyService.exists(ctx, policyId))) {
    throw unprocessable("policyId does not refer to an existing result policy");
  }
  for (const { examId } of exams ?? []) {
    const exam = await examService.findById(ctx, examId);
    if (!exam) throw unprocessable("One or more exams do not exist");
    if (exam.academicYearId !== academicYearId) {
      throw unprocessable(`${exam.examName} belongs to another academic year; a scheme combines exams of one year`);
    }
  }
};

export const assessmentSchemeService = {
  /* Year-scoped (ctx.academicYearId from resolveAcademicYear) */
  list: (ctx, { page, limit }) =>
    assessmentSchemeRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withExams,
      conditions: [eq(assessmentSchemes.academicYearId, ctx.academicYearId)]
    }),

  getById: load,

  create: async (ctx, { exams, ...data }) => {
    await assertReferences(ctx, ctx.academicYearId, { ...data, exams });
    const id = await transaction(async tx => {
      const scheme = await assessmentSchemeRepository.create(
        ctx.tenantId,
        { ...data, academicYearId: ctx.academicYearId },
        { dbc: tx }
      );
      await assessmentSchemeRepository.replaceExams(ctx.tenantId, scheme.id, exams, { dbc: tx });
      return scheme.id;
    });
    return load(ctx, id);
  },

  /* Published results stay frozen in their snapshots; compare them with the live results after a change */
  update: async (ctx, schemeId, { exams, ...data }) => {
    const scheme = await load(ctx, schemeId);
    await assertReferences(ctx, scheme.academicYearId, { ...data, exams });
    await transaction(async tx => {
      await assessmentSchemeRepository.update(ctx.tenantId, schemeId, data, { dbc: tx });
      if (exams) await assessmentSchemeRepository.replaceExams(ctx.tenantId, schemeId, exams, { dbc: tx });
    });
    return load(ctx, schemeId);
  },

  remove: async (ctx, schemeId) => {
    const scheme = await load(ctx, schemeId);
    if (scheme.resultsPublishedAt) {
      throw conflict(`${scheme.name} has published results. Withdraw them before removing the scheme.`);
    }
    await assessmentSchemeRepository.softDelete(ctx.tenantId, schemeId);
    return scheme;
  },

  /* For publication */
  lockForUpdate: (ctx, schemeId, { dbc }) => assessmentSchemeRepository.lockForUpdate(ctx.tenantId, schemeId, { dbc }),

  setResultsPublishedAt: (ctx, schemeId, publishedAt, { dbc }) =>
    assessmentSchemeRepository.update(ctx.tenantId, schemeId, { resultsPublishedAt: publishedAt }, { dbc })
};
