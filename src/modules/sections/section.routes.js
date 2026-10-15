import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as sectionController from "./section.controller.js";

/* Mounted at /api/academic/sections. `year` = current year or X-Academic-Year-Id */
const router = express.Router();

router.post("/bulk", permissionMiddleware("SECTION", "BULK"), year, auditMiddleware("SECTION", "BULK"), sectionController.createSectionsBulk);
router.post("/", permissionMiddleware("SECTION", "CREATE"), year, auditMiddleware("SECTION", "CREATE"), sectionController.createSection);
router.get("/", permissionMiddleware("SECTION", "READ"), year, sectionController.getSections);
router.get("/class/:classId", permissionMiddleware("SECTION", "READ"), year, sectionController.getSectionsByClass);
router.get("/:sectionId", permissionMiddleware("SECTION", "READ"), sectionController.getSectionById);
router.put("/:sectionId", permissionMiddleware("SECTION", "UPDATE"), auditMiddleware("SECTION", "UPDATE"), sectionController.updateSection);

export default router;
