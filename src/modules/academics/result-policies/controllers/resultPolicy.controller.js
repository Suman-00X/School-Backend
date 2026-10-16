import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { assignmentTarget, resultPolicyAssignmentService } from "../services/resultPolicyAssignment.service.js";
import { resultPolicyService } from "../services/resultPolicy.service.js";

const SOURCE_LABEL = {
  EXAM_CLASS: "assigned to this exam for this class",
  EXAM: "assigned to this exam",
  CLASS: "assigned to this class",
  SCHOOL_DEFAULT: "the school default",
  BUILT_IN: "the built-in standard rules (no policy set)"
};

export const resultPolicyController = {
  create: async (req, res) => {
    const policy = await resultPolicyService.create(req.context, req.body);
    return created(
      res,
      policy,
      `Result policy ${policy.name} created (${resultPolicyService.describe(policy)}${policy.isDefault ? ", school default" : ""})`
    );
  },

  list: async (req, res) =>
    paginated(res, await resultPolicyService.list(req.context, req.query), "Result policies retrieved successfully"),

  getById: async (req, res) =>
    ok(
      res,
      await resultPolicyService.getById(req.context, req.params.policyId),
      "Result policy retrieved successfully"
    ),

  update: async (req, res) => {
    const policy = await resultPolicyService.update(req.context, req.params.policyId, req.body);
    return ok(res, policy, `Result policy ${policy.name} updated`);
  },

  remove: async (req, res) => {
    const policy = await resultPolicyService.remove(req.context, req.params.policyId);
    return done(res, `Result policy ${policy.name} removed`);
  },

  resolution: async (req, res) => {
    const resolved = await resultPolicyService.explain(req.context, req.query);
    return ok(res, resolved, `${resolved.policy.name} applies: ${SOURCE_LABEL[resolved.source]}`);
  },

  /* /result-policy-assignments */
  createAssignment: async (req, res) => {
    const assignment = await resultPolicyAssignmentService.create(req.context, req.body);
    return created(
      res,
      assignment,
      `Result policy ${assignment.policy.name} assigned to ${assignmentTarget(assignment)}`
    );
  },

  listAssignments: async (req, res) =>
    paginated(
      res,
      await resultPolicyAssignmentService.list(req.context, req.query),
      "Result policy assignments retrieved successfully"
    ),

  getAssignment: async (req, res) =>
    ok(
      res,
      await resultPolicyAssignmentService.getById(req.context, req.params.assignmentId),
      "Result policy assignment retrieved successfully"
    ),

  updateAssignment: async (req, res) => {
    const assignment = await resultPolicyAssignmentService.update(req.context, req.params.assignmentId, req.body);
    return ok(res, assignment, `${assignmentTarget(assignment)} now uses result policy ${assignment.policy.name}`);
  },

  removeAssignment: async (req, res) => {
    const assignment = await resultPolicyAssignmentService.remove(req.context, req.params.assignmentId);
    return done(res, `Result policy ${assignment.policy.name} no longer applies to ${assignmentTarget(assignment)}`);
  }
};
