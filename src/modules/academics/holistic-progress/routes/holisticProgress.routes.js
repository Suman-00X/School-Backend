import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { holisticProgressController as controller } from "../controllers/holisticProgress.controller.js";
import { HOLISTIC_PROGRESS_PERMISSIONS as can } from "../permissions/holisticProgress.permissions.js";
import { holisticProgressValidators as rules } from "../validators/holisticProgress.validator.js";

/* /api/v1/academics/holistic-progress: one card per student per exam, for the stages the
   school's NEP policy has it for (409 otherwise) */
const router = createRouter();

router.get("/exams/:examId/sections/:sectionId", authorize(can.read), validate(rules.section), controller.section);
router.get("/exams/:examId/students/:studentId", authorize(can.read), validate(rules.student), controller.student);
router.put("/exams/:examId/students/:studentId", authorize(can.record), validate(rules.save), controller.save);
router.get("/exams/:examId/students/:studentId/pdf", authorize(can.read), validate(rules.student), controller.pdf);

export default router;
