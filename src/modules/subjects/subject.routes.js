import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as subjectController from "./subject.controller.js";

/* Mounted at /api/academic/subjects (shared across academic years) */
const router = express.Router();

router.post("/bulk", permissionMiddleware("SUBJECT", "BULK"), auditMiddleware("SUBJECT", "BULK"), subjectController.createSubjectsBulk);
router.post("/", permissionMiddleware("SUBJECT", "CREATE"), auditMiddleware("SUBJECT", "CREATE"), subjectController.createSubject);
router.get("/", permissionMiddleware("SUBJECT", "READ"), subjectController.getSubjects);
router.get("/:subjectId", permissionMiddleware("SUBJECT", "READ"), subjectController.getSubjectById);
router.put("/:subjectId", permissionMiddleware("SUBJECT", "UPDATE"), auditMiddleware("SUBJECT", "UPDATE"), subjectController.updateSubject);

export default router;
