import { asc, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { assessmentService } from "../../assessments/index.js";
import { examService } from "../../exams/index.js";
import { resultPolicyService } from "../../result-policies/index.js";
import { assessmentSchemeBuckets, assessmentSchemeExams, assessmentSchemes } from "../models/assessmentScheme.schema.js";
import { assessmentSchemeRepository } from "../repositories/assessmentScheme.repository.js";
import { weightTotal } from "../validators/assessmentScheme.validator.js";

const withExams = {
  exams: {
    orderBy: [asc(assessmentSchemeExams.sortOrder)],
    with: { exam: { columns: { id: true, examName: true, examType: true, startDate: true, endDate: true } } }
  },
  buckets: {
    where: eq(assessmentSchemeBuckets.isActive, true),
    orderBy: [asc(assessmentSchemeBuckets.sortOrder)],
    columns: { id: true, name: true, weight: true, sortOrder: true }
  },
  policy: { columns: { id: true, name: true, gradingMode: true } }
};

/* "Term 1 40% + Term 2 60%" */
export const weightsLabel = scheme =>
  [...scheme.exams.map(e => `${e.exam.examName} ${e.weight}%`), ...(scheme.buckets ?? []).map(b => `${b.name} ${b.weight}%`)].join(
    " + "
  );

/* A bucket that teachers have filled cannot go; an unknown id is not one of the scheme's */
const assertBuckets = async (ctx, scheme, buckets) => {
  const known = new Map(scheme.buckets.map(b => [b.id, b]));
  const unknown = buckets.find(b => b.id && !known.has(b.id));
  if (unknown) throw unprocessable("One or more buckets do not belong to this scheme");
  const removed = scheme.buckets.filter(b => !buckets.some(kept => kept.id === b.id));
  const used = await assessmentService.countByBucket(
    ctx,
    removed.map(b => b.id)
  );
  const busy = removed.find(b => used.get(b.id));
  if (busy) {
    throw conflict(`${busy.name} has ${used.get(busy.id)} teacher assessment(s). Move or delete them before removing the bucket.`);
  }
};

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

  create: async (ctx, { exams, buckets, ...data }) => {
    if (buckets?.some(b => b.id)) throw unprocessable("A new scheme's buckets cannot have ids");
    await assertReferences(ctx, ctx.academicYearId, { ...data, exams });
    const id = await transaction(async tx => {
      const scheme = await assessmentSchemeRepository.create(
        ctx.tenantId,
        { ...data, academicYearId: ctx.academicYearId },
        { dbc: tx }
      );
      await assessmentSchemeRepository.replaceExams(ctx.tenantId, scheme.id, exams, { dbc: tx });
      if (buckets?.length) await assessmentSchemeRepository.replaceBuckets(ctx.tenantId, scheme.id, buckets, { dbc: tx });
      return scheme.id;
    });
    return load(ctx, id);
  },

  /* Published results stay frozen in their snapshots; compare them with the live results after a change */
  update: async (ctx, schemeId, { exams, buckets, ...data }) => {
    const scheme = await load(ctx, schemeId);
    await assertReferences(ctx, scheme.academicYearId, { ...data, exams });
    if (exams || buckets) {
      const total = weightTotal({ exams: exams ?? scheme.exams, buckets: buckets ?? scheme.buckets });
      if (total !== 10_000) {
        throw unprocessable(`Exam and bucket weights must add up to 100 (they add up to ${total / 100})`);
      }
    }
    if (buckets) await assertBuckets(ctx, scheme, buckets);
    await transaction(async tx => {
      await assessmentSchemeRepository.update(ctx.tenantId, schemeId, data, { dbc: tx });
      if (exams) await assessmentSchemeRepository.replaceExams(ctx.tenantId, schemeId, exams, { dbc: tx });
      if (buckets) await assessmentSchemeRepository.replaceBuckets(ctx.tenantId, schemeId, buckets, { dbc: tx });
    });
    return load(ctx, schemeId);
  },

  remove: async (ctx, schemeId) => {
    const scheme = await load(ctx, schemeId);
    if (scheme.resultsPublishedAt) {
      throw conflict(`${scheme.name} has published results. Withdraw them before removing the scheme.`);
    }
    const used = await assessmentService.countByBucket(
      ctx,
      scheme.buckets.map(b => b.id)
    );
    const busy = scheme.buckets.find(b => used.get(b.id));
    if (busy) {
      throw conflict(`${busy.name} has teacher assessments. Move or delete them before removing the scheme.`);
    }
    await assessmentSchemeRepository.softDelete(ctx.tenantId, schemeId);
    return scheme;
  },

  /* For publication */
  lockForUpdate: (ctx, schemeId, { dbc }) => assessmentSchemeRepository.lockForUpdate(ctx.tenantId, schemeId, { dbc }),

  setResultsPublishedAt: (ctx, schemeId, publishedAt, { dbc }) =>
    assessmentSchemeRepository.update(ctx.tenantId, schemeId, { resultsPublishedAt: publishedAt }, { dbc })
};
