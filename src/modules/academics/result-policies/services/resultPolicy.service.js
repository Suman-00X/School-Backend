import { and, asc, eq, isNull, or } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { gradingService } from "../../grading/index.js";
import { sectionService } from "../../sections/index.js";
import { subjectService } from "../../subjects/index.js";
import { resultPolicies, resultPolicyAssignments, resultPolicySubjects } from "../models/resultPolicy.schema.js";
import {
  resultPolicyAssignmentRepository,
  resultPolicyRepository,
  resultPolicySubjectRepository
} from "../repositories/resultPolicy.repository.js";
import { BUILT_IN_POLICY, POLICY_FIELDS, toConfig } from "./resultEngine.service.js";

/* An engine config as JSON (reports and snapshots carry it) */
export const policyView = ({ rules: _rules, ...config }) => config;

const withSubjects = {
  subjects: {
    orderBy: [asc(resultPolicySubjects.createdAt)],
    with: { subject: { columns: { id: true, subjectName: true, subjectCode: true } } }
  }
};

const MODE_LABEL = { MARKS: "marks", GRADES: "letter grades", GPA: "GPA", PASS_FAIL: "pass/fail" };

/* Business rules on a whole policy (create, update, inline preview) -> 422 */
const assertPolicy = async (ctx, policy) => {
  for (const key of ["gradeScaleId", "coScholasticScaleId"]) {
    if (policy[key] && !(await gradingService.exists(ctx, policy[key]))) {
      throw unprocessable(`${key} does not refer to an existing grade scale`);
    }
  }

  if (policy.gradingMode === "GPA") {
    if (!policy.gpaScale) throw unprocessable("A GPA policy needs gpaScale (the highest grade point, e.g. 4, 5 or 10)");
    const scale = await gradingService.resolveScale(ctx, policy.gradeScaleId);
    if (!scale) {
      throw unprocessable(
        "A GPA policy needs a grade scale with grade points: set gradeScaleId or a default grade scale"
      );
    }
    const missing = [...scale.bands]
      .sort((a, b) => b.minPercent - a.minPercent)
      .filter(band => band.isPassing && (band.gradePoint === null || band.gradePoint === undefined));
    if (missing.length) {
      throw unprocessable(
        `Grade scale ${scale.name} has no grade point for ${missing.map(b => b.grade).join(", ")}; GPA needs one on every passing band`
      );
    }
    const highest = Math.max(...scale.bands.map(band => band.gradePoint ?? 0));
    if (highest > policy.gpaScale) {
      throw unprocessable(
        `Grade scale ${scale.name} has grade points up to ${highest}, above this policy's ${policy.gpaScale}-point GPA scale`
      );
    }
  }

  if (policy.gradingMode === "PASS_FAIL" && policy.rankingMethod !== "NONE") {
    throw unprocessable("A pass/fail policy cannot rank students: set rankingMethod to NONE");
  }
  if (policy.graceMaxPerSubject > policy.graceMaxTotal) {
    throw unprocessable(
      `graceMaxPerSubject (${policy.graceMaxPerSubject}) cannot exceed graceMaxTotal (${policy.graceMaxTotal})`
    );
  }

  const rules = policy.subjects ?? [];
  if (rules.length) {
    const found = await subjectService.findManyByIds(
      ctx,
      rules.map(rule => rule.subjectId)
    );
    if (found.length !== new Set(rules.map(rule => rule.subjectId)).size) {
      throw unprocessable("One or more subject rules name a subject that does not exist");
    }
    const mandatory = rules.filter(rule => rule.isMandatory);
    if (policy.bestOfSubjects && mandatory.length > policy.bestOfSubjects) {
      throw unprocessable(
        `${mandatory.length} mandatory subjects cannot fit in the best ${policy.bestOfSubjects} subjects counted`
      );
    }
  }
};

/* Defaults that depend on other fields: pass/fail turns ranking off; a per-subject
   grace limit alone also raises the total limit to match */
const withDerivedDefaults = (data, current = null) => {
  const next = { ...data };
  if (next.gradingMode === "PASS_FAIL" && next.rankingMethod === undefined) next.rankingMethod = "NONE";
  if (next.graceMaxPerSubject !== undefined && next.graceMaxTotal === undefined) {
    next.graceMaxTotal = Math.max(current?.graceMaxTotal ?? 0, next.graceMaxPerSubject);
  }
  return next;
};

/* The policy as it would be stored: built-in defaults, the current row, then the changes */
const mergedPolicy = (current, changes) => {
  const merged = { ...BUILT_IN_POLICY, ...current };
  for (const [key, value] of Object.entries(changes)) if (value !== undefined) merged[key] = value;
  return merged;
};

const columnsOf = data => Object.fromEntries(Object.entries(data).filter(([key]) => POLICY_FIELDS.includes(key)));

const loadPolicy = async (ctx, policyId) => {
  const policy = await resultPolicyRepository.findById(ctx.tenantId, policyId, { with: withSubjects });
  if (!policy) throw notFound("Result policy");
  return policy;
};

/* Most specific assignment wins: exam + class, then exam, then class */
const SPECIFICITY = [
  {
    source: "EXAM_CLASS",
    match: (a, examId, classId) => examId && classId && a.examId === examId && a.classId === classId
  },
  { source: "EXAM", match: (a, examId) => examId && a.examId === examId && !a.classId },
  { source: "CLASS", match: (a, examId, classId) => classId && !a.examId && a.classId === classId }
];

export const resultPolicyService = {
  list: (ctx, { page, limit, gradingMode }) =>
    resultPolicyRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [gradingMode && eq(resultPolicies.gradingMode, gradingMode)].filter(Boolean),
      with: withSubjects
    }),

  getById: loadPolicy,

  create: async (ctx, { subjects = [], ...input }) => {
    const data = withDerivedDefaults(input);
    await assertPolicy(ctx, { ...mergedPolicy(null, data), subjects });
    const id = await transaction(async tx => {
      if (data.isDefault) await resultPolicyRepository.clearDefault(ctx.tenantId, null, { dbc: tx });
      const policy = await resultPolicyRepository.create(
        ctx.tenantId,
        { name: data.name, description: data.description, isDefault: data.isDefault ?? false, ...columnsOf(data) },
        { dbc: tx }
      );
      await resultPolicySubjectRepository.replaceForPolicy(ctx.tenantId, policy.id, subjects, { dbc: tx });
      return policy.id;
    });
    return loadPolicy(ctx, id);
  },

  update: async (ctx, policyId, { subjects, ...input }) => {
    await transaction(async tx => {
      const current = await resultPolicyRepository.findById(ctx.tenantId, policyId, { dbc: tx, with: withSubjects });
      if (!current) throw notFound("Result policy");
      const data = withDerivedDefaults(input, current);
      await assertPolicy(ctx, { ...mergedPolicy(current, data), subjects: subjects ?? current.subjects });
      if (data.isDefault) await resultPolicyRepository.clearDefault(ctx.tenantId, policyId, { dbc: tx });
      await resultPolicyRepository.update(
        ctx.tenantId,
        policyId,
        { name: data.name, description: data.description, isDefault: data.isDefault, ...columnsOf(data) },
        { dbc: tx }
      );
      if (subjects) await resultPolicySubjectRepository.replaceForPolicy(ctx.tenantId, policyId, subjects, { dbc: tx });
    });
    return loadPolicy(ctx, policyId);
  },

  remove: async (ctx, policyId) => {
    const policy = await loadPolicy(ctx, policyId);
    const assigned = await resultPolicyAssignmentRepository.count(ctx.tenantId, [
      eq(resultPolicyAssignments.policyId, policyId)
    ]);
    if (assigned) {
      throw conflict(
        `Result policy ${policy.name} is assigned to ${assigned} exam or class target(s). Remove those assignments first.`
      );
    }
    return resultPolicyRepository.softDelete(ctx.tenantId, policyId);
  },

  /* For other submodules */

  /* A policy body sent inline (preview) -> engine config; 422 when it breaks a rule */
  configFromInput: async (ctx, { subjects = [], ...input }) => {
    const data = withDerivedDefaults(input);
    const policy = { ...mergedPolicy(null, data), subjects };
    await assertPolicy(ctx, policy);
    return toConfig({ ...policy, id: null, name: data.name ?? "Preview" });
  },

  /* A stored policy -> engine config, or null when missing */
  configById: async (ctx, policyId) => {
    const policy = await resultPolicyRepository.findById(ctx.tenantId, policyId, { with: withSubjects });
    return policy ? toConfig(policy) : null;
  },

  exists: (ctx, policyId) => resultPolicyRepository.exists(ctx.tenantId, [eq(resultPolicies.id, policyId)]),

  /* A removed exam takes its policy assignments with it */
  releaseExam: (ctx, examId, { dbc }) =>
    resultPolicyAssignmentRepository.softDeleteWhere(ctx.tenantId, [eq(resultPolicyAssignments.examId, examId)], { dbc }),

  /* The policy for an exam sat by a class: exam + class, exam, class, school default, built-in.
     For an assessment scheme pass examId null (scheme -> class -> default). -> { policy, source } */
  resolve: async (ctx, { examId = null, classId = null }) => {
    ctx.resultPolicies ??= new Map();
    const key = `${examId}:${classId}`;
    if (!ctx.resultPolicies.has(key)) {
      ctx.resultPolicies.set(
        key,
        (async () => {
          const targets = [
            examId &&
              classId &&
              and(eq(resultPolicyAssignments.examId, examId), eq(resultPolicyAssignments.classId, classId)),
            examId && and(eq(resultPolicyAssignments.examId, examId), isNull(resultPolicyAssignments.classId)),
            classId && and(isNull(resultPolicyAssignments.examId), eq(resultPolicyAssignments.classId, classId))
          ].filter(Boolean);
          const assignments = targets.length
            ? await resultPolicyAssignmentRepository.findMany(ctx.tenantId, { conditions: [or(...targets)] })
            : [];
          for (const { source, match } of SPECIFICITY) {
            const assignment = assignments.find(a => match(a, examId, classId));
            const policy = assignment && (await resultPolicyService.configById(ctx, assignment.policyId));
            if (policy) return { policy, source, assignmentId: assignment.id };
          }
          const fallback = await resultPolicyRepository.findOne(ctx.tenantId, [eq(resultPolicies.isDefault, true)], {
            with: withSubjects
          });
          return fallback
            ? { policy: toConfig(fallback), source: "SCHOOL_DEFAULT" }
            : { policy: toConfig(BUILT_IN_POLICY), source: "BUILT_IN" };
        })()
      );
    }
    return ctx.resultPolicies.get(key);
  },

  /* Which policy applies and why (GET /result-policies/resolution) */
  explain: async (ctx, { examId, classId, sectionId }) => {
    if (sectionId) {
      const section = await sectionService.findById(ctx, sectionId);
      if (!section) throw unprocessable("sectionId does not refer to an existing section");
      classId = section.classId;
    }
    const { policy, source, assignmentId } = await resultPolicyService.resolve(ctx, { examId, classId });
    return {
      source,
      assignmentId: assignmentId ?? null,
      examId: examId ?? null,
      classId: classId ?? null,
      policy: policyView(policy)
    };
  },

  /* "GPA (10-point)", "letter grades" */
  describe: policy => (policy.gradingMode === "GPA" ? `GPA (${policy.gpaScale}-point)` : MODE_LABEL[policy.gradingMode])
};
