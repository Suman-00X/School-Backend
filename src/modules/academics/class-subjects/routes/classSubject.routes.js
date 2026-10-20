import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { classSubjectController as controller } from "../controllers/classSubject.controller.js";
import { CLASS_SUBJECT_PERMISSIONS as can } from "../permissions/classSubject.permissions.js";
import { classSubjectValidators as rules } from "../validators/classSubject.validator.js";

/* /api/v1/academics/class-subjects */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.patch("/:classSubjectId", authorize(can.update), validate(rules.update), controller.update);
router.delete("/:classSubjectId", authorize(can.remove), validate(rules.remove), controller.remove);

export default router;
