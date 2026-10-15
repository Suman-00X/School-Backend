import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as examController from "./exam.controller.js";

/* Mounted at /api/academic/exams */
const router = express.Router();

router.post("/bulk", permissionMiddleware("EXAM", "BULK"), year, auditMiddleware("EXAM", "BULK"), examController.createExamsBulk);
router.post("/", permissionMiddleware("EXAM", "CREATE"), year, auditMiddleware("EXAM", "CREATE"), examController.createExam);
router.get("/", permissionMiddleware("EXAM", "READ"), year, examController.getExams);
router.get("/:examId", permissionMiddleware("EXAM", "READ"), examController.getExamById);
router.put("/:examId", permissionMiddleware("EXAM", "UPDATE"), auditMiddleware("EXAM", "UPDATE"), examController.updateExam);

export default router;
