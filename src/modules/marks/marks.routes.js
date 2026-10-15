import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as marksController from "./marks.controller.js";

/* Mounted at /api/academic/marks */
const router = express.Router();

router.post("/bulk", permissionMiddleware("MARKS", "BULK"), auditMiddleware("MARKS", "BULK"), marksController.upsertMarksBulk);
router.post("/", permissionMiddleware("MARKS", "CREATE"), auditMiddleware("MARKS", "CREATE"), marksController.upsertMarks);
router.get("/student/:studentId", permissionMiddleware("MARKS", "READ"), year, marksController.getMarksByStudent);

export default router;
