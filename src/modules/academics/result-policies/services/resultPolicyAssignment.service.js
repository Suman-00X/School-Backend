import { eq, isNull } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { classService } from "../../classes/index.js";
import { examService } from "../../exams/index.js";
import { resultPolicyAssignments } from "../models/resultPolicy.schema.js";
import { resultPolicyAssignmentRepository, resultPolicyRepository } from "../repositories/resultPolicy.repository.js";

const withDetails = {
  policy: { columns: { id: true, name: true, gradingMode: true } },
  exam: { columns: { id: true, examName: true, academicYearId: true } },
  class: { columns: { id: true, className: true } }
};

/* "Final for Class 10", "Final (every class)", "Class 10 (every exam)" */
export const assignmentTarget = ({ exam, class: klass }) =>
  exam && klass
    ? `${exam.examName} for ${klass.className}`
    : exam
      ? `${exam.examName} (every class)`
      : `${klass.className} (every exam)`;

const load = async (ctx, assignmentId) => {
  const assignment = await resultPolicyAssignmentRepository.findById(ctx.tenantId, assignmentId, { with: withDetails });
  if (!assignment) throw notFound("Result policy assignment");
  return assignment;
};

const assertPolicy = async (ctx, policyId) => {
  const policy = await resultPolicyRepository.findById(ctx.tenantId, policyId);
  if (!policy) throw unprocessable("policyId does not refer to an existing result policy");
  return policy;
};

export const resultPolicyAssignmentService = {
  list: (ctx, { page, limit, policyId, examId, classId }) =>
    resultPolicyAssignmentRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        policyId && eq(resultPolicyAssignments.policyId, policyId),
        examId && eq(resultPolicyAssignments.examId, examId),
        classId && eq(resultPolicyAssignments.classId, classId)
      ].filter(Boolean)
    }),

  getById: load,

  /* One policy per target; the database's partial unique indexes back this check */
  create: async (ctx, { policyId, examId, classId }) => {
    await assertPolicy(ctx, policyId);
    if (examId && !(await examService.findById(ctx, examId))) {
      throw unprocessable("examId does not refer to an existing exam");
    }
    if (classId && !(await classService.findById(ctx, classId))) {
      throw unprocessable("classId does not refer to an existing class");
    }
    const existing = await resultPolicyAssignmentRepository.findOne(
      ctx.tenantId,
      [
        examId ? eq(resultPolicyAssignments.examId, examId) : isNull(resultPolicyAssignments.examId),
        classId ? eq(resultPolicyAssignments.classId, classId) : isNull(resultPolicyAssignments.classId)
      ],
      { with: withDetails }
    );
    if (existing) {
      throw conflict(
        `${assignmentTarget(existing)} already uses result policy ${existing.policy.name}. Change that assignment instead.`
      );
    }
    const row = await resultPolicyAssignmentRepository.create(ctx.tenantId, {
      policyId,
      examId: examId ?? null,
      classId: classId ?? null
    });
    return load(ctx, row.id);
  },

  /* Point a target at another policy */
  update: async (ctx, assignmentId, { policyId }) => {
    await load(ctx, assignmentId);
    await assertPolicy(ctx, policyId);
    await resultPolicyAssignmentRepository.update(ctx.tenantId, assignmentId, { policyId });
    return load(ctx, assignmentId);
  },

  remove: async (ctx, assignmentId) => {
    const assignment = await load(ctx, assignmentId);
    await resultPolicyAssignmentRepository.softDelete(ctx.tenantId, assignmentId);
    return assignment;
  }
};
