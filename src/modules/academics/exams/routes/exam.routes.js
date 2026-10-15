import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { examController as controller } from "../controllers/exam.controller.js";
import { examPaperController as papers } from "../controllers/examPaper.controller.js";
import { EXAM_PERMISSIONS as can } from "../permissions/exam.permissions.js";
import { examValidators as rules } from "../validators/exam.validator.js";

/* /api/v1/academics/exams */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.post("/bulk", authorize(can.create), validate(rules.createMany), inYear, controller.createMany);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:examId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:examId", authorize(can.update), validate(rules.update), controller.update);

/* /api/v1/academics/exams/:examId/papers */
router.get("/:examId/papers", authorize(can.read), validate(rules.listPapers), papers.list);
router.post("/:examId/papers", authorize(can.managePapers), validate(rules.createPaper), papers.create);

export default router;
