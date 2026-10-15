import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as enrollmentController from "./enrollment.controller.js";

/* Mounted at /api/academic/student-section-map */
const router = express.Router();

/* Promotion names both years in the body, so no `year` middleware */
router.post("/promote", permissionMiddleware("STUDENT_SECTION", "CREATE"), auditMiddleware("STUDENT_PROMOTION", "CREATE"), enrollmentController.promoteStudent);
router.post("/", permissionMiddleware("STUDENT_SECTION", "CREATE"), year, auditMiddleware("STUDENT_SECTION", "CREATE"), enrollmentController.mapStudentToSection);
router.get("/section/:sectionId", permissionMiddleware("STUDENT_SECTION", "READ"), year, enrollmentController.getStudentsBySection);
router.put("/:mapId", permissionMiddleware("STUDENT_SECTION", "UPDATE"), year, auditMiddleware("STUDENT_SECTION", "UPDATE"), enrollmentController.updateStudentSectionMap);

export default router;
