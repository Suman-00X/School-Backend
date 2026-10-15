import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as examSubjectController from "./examSubject.controller.js";

/* Mounted at /api/academic/exam-section-subject-map */
const router = express.Router();

router.post("/", permissionMiddleware("EXAM_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("EXAM_SECTION_SUBJECT", "CREATE"), examSubjectController.createExamSubject);
router.get("/exam/:examId", permissionMiddleware("EXAM_SECTION_SUBJECT", "READ"), examSubjectController.getExamStructure);

export default router;
