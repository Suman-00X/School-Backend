import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { sectionSubjectController as controller } from "../controllers/sectionSubject.controller.js";
import { SECTION_SUBJECT_PERMISSIONS as can } from "../permissions/sectionSubject.permissions.js";
import { sectionSubjectValidators as rules } from "../validators/sectionSubject.validator.js";

/* /api/v1/academics/section-subjects */
const router = Router();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.delete("/:sectionSubjectId", authorize(can.remove), validate(rules.remove), controller.remove);

export default router;
