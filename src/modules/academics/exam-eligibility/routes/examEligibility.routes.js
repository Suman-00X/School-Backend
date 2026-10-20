import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { examEligibilityController as controller } from "../controllers/examEligibility.controller.js";
import { EXAM_ELIGIBILITY_PERMISSIONS as can } from "../permissions/examEligibility.permissions.js";
import { examEligibilityValidators as rules } from "../validators/examEligibility.validator.js";

/* /api/v1/academics/exam-eligibility: the school's rules (attendance, overdue fees) */
export const examEligibilityRoutes = createRouter();

examEligibilityRoutes.get("/policy", authorize(can.readPolicy), controller.getPolicy);
examEligibilityRoutes.patch("/policy", authorize(can.managePolicy), validate(rules.updatePolicy), controller.updatePolicy);

/* Mounted at /api/v1/academics/exams: who may sit one exam, and exemptions from the rules */
export const examEligibilityExamRoutes = createRouter();

examEligibilityExamRoutes.get("/:examId/eligibility", authorize(can.read), validate(rules.evaluate), controller.evaluate);
examEligibilityExamRoutes.post(
  "/:examId/eligibility-exemptions",
  authorize(can.exempt),
  validate(rules.exempt),
  controller.exempt
);
examEligibilityExamRoutes.delete(
  "/:examId/eligibility-exemptions/:studentId",
  authorize(can.exempt),
  validate(rules.removeExemption),
  controller.removeExemption
);
