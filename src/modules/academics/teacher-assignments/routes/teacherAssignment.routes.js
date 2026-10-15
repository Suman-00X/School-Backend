import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { teacherAssignmentController as controller } from "../controllers/teacherAssignment.controller.js";
import { TEACHER_ASSIGNMENT_PERMISSIONS as can } from "../permissions/teacherAssignment.permissions.js";
import { teacherAssignmentValidators as rules } from "../validators/teacherAssignment.validator.js";

/* /api/v1/academics/teacher-assignments */
const router = Router();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.delete("/:assignmentId", authorize(can.remove), validate(rules.remove), controller.remove);

export default router;
