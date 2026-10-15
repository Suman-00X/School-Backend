import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as academicYearController from "./academicYear.controller.js";

/* Mounted at /api/academic/academic-years */
const router = express.Router();

router.post("/", permissionMiddleware("ACADEMIC_YEAR", "CREATE"), auditMiddleware("ACADEMIC_YEAR", "CREATE"), academicYearController.createAcademicYear);
router.get("/", permissionMiddleware("ACADEMIC_YEAR", "READ"), academicYearController.getAcademicYears);
router.get("/:academicYearId", permissionMiddleware("ACADEMIC_YEAR", "READ"), academicYearController.getAcademicYearById);
router.put("/:academicYearId", permissionMiddleware("ACADEMIC_YEAR", "UPDATE"), auditMiddleware("ACADEMIC_YEAR", "UPDATE"), academicYearController.updateAcademicYear);

export default router;
