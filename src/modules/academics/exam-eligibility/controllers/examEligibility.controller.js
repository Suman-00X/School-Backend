import { created, ok } from "../../../../common/http/responses.js";
import { examEligibilityPolicyService, examEligibilityService } from "../services/examEligibility.service.js";

const ruleText = policy =>
  [
    policy.attendanceRuleEnabled && `attendance at least ${policy.minAttendancePercentage}%`,
    policy.duesRuleEnabled &&
      (policy.maxOverdueAmount > 0 ? `overdue fees at most ${policy.maxOverdueAmount}` : "no overdue fees")
  ]
    .filter(Boolean)
    .join(" and ") || "no rules (every student may sit exams)";

export const examEligibilityController = {
  getPolicy: async (req, res) =>
    ok(res, await examEligibilityPolicyService.get(req.context), "Exam eligibility policy retrieved successfully"),

  updatePolicy: async (req, res) => {
    const policy = await examEligibilityPolicyService.update(req.context, req.body);
    return ok(res, policy, `Exam eligibility policy updated: ${ruleText(policy)}`);
  },

  evaluate: async (req, res) =>
    ok(
      res,
      await examEligibilityService.evaluate(req.context, req.params.examId, req.query),
      "Exam eligibility retrieved successfully"
    ),

  exempt: async (req, res) =>
    created(
      res,
      await examEligibilityService.exempt(req.context, req.params.examId, req.body),
      "The student may sit this exam"
    ),

  removeExemption: async (req, res) =>
    ok(
      res,
      await examEligibilityService.removeExemption(req.context, req.params.examId, req.params.studentId),
      "Exemption removed: the eligibility rules apply to the student again"
    )
};
