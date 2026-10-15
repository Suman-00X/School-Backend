import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as teacherAssignmentController from "./teacherAssignment.controller.js";

/* Mounted at /api/academic/teacher-section-subject-map */
const router = express.Router();

router.post("/", permissionMiddleware("TEACHER_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("TEACHER_SECTION_SUBJECT", "CREATE"), teacherAssignmentController.createTeacherAssignment);
router.get("/section/:sectionId", permissionMiddleware("TEACHER_SECTION_SUBJECT", "READ"), year, teacherAssignmentController.getTeachersBySection);
router.delete("/:mapId", permissionMiddleware("TEACHER_SECTION_SUBJECT", "DELETE"), auditMiddleware("TEACHER_SECTION_SUBJECT", "DELETE"), teacherAssignmentController.removeTeacherAssignment);

export default router;
