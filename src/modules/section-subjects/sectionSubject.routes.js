import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../academic-years/academicYear.middleware.js";
import * as sectionSubjectController from "./sectionSubject.controller.js";

/* Mounted at /api/academic/class-section-subject-map */
const router = express.Router();

router.post("/", permissionMiddleware("CLASS_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("CLASS_SECTION_SUBJECT", "CREATE"), sectionSubjectController.createSectionSubject);
router.get("/section/:sectionId", permissionMiddleware("CLASS_SECTION_SUBJECT", "READ"), year, sectionSubjectController.getSubjectsBySection);
router.delete("/:mapId", permissionMiddleware("CLASS_SECTION_SUBJECT", "DELETE"), auditMiddleware("CLASS_SECTION_SUBJECT", "DELETE"), sectionSubjectController.removeSectionSubject);

export default router;
