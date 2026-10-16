import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resultPolicyController as controller } from "../controllers/resultPolicy.controller.js";
import { RESULT_POLICY_PERMISSIONS as can } from "../permissions/resultPolicy.permissions.js";
import { resultPolicyValidators as rules } from "../validators/resultPolicy.validator.js";

/* /api/v1/academics/result-policies */
export const resultPolicyRoutes = createRouter();

resultPolicyRoutes.post("/", authorize(can.manage), validate(rules.create), controller.create);
resultPolicyRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
/* Which policy applies to an exam and/or class, and why */
resultPolicyRoutes.get("/resolution", authorize(can.read), validate(rules.resolution), controller.resolution);
resultPolicyRoutes.get("/:policyId", authorize(can.read), validate(rules.getById), controller.getById);
resultPolicyRoutes.patch("/:policyId", authorize(can.manage), validate(rules.update), controller.update);
resultPolicyRoutes.delete("/:policyId", authorize(can.manage), validate(rules.remove), controller.remove);

/* /api/v1/academics/result-policy-assignments: a policy for an exam, a class, or an exam in one class */
export const resultPolicyAssignmentRoutes = createRouter();

resultPolicyAssignmentRoutes.post(
  "/",
  authorize(can.manage),
  validate(rules.createAssignment),
  controller.createAssignment
);
resultPolicyAssignmentRoutes.get("/", authorize(can.read), validate(rules.listAssignments), controller.listAssignments);
resultPolicyAssignmentRoutes.get(
  "/:assignmentId",
  authorize(can.read),
  validate(rules.assignment),
  controller.getAssignment
);
resultPolicyAssignmentRoutes.patch(
  "/:assignmentId",
  authorize(can.manage),
  validate(rules.updateAssignment),
  controller.updateAssignment
);
resultPolicyAssignmentRoutes.delete(
  "/:assignmentId",
  authorize(can.manage),
  validate(rules.assignment),
  controller.removeAssignment
);
