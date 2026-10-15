import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as teacherController from "./teacher.controller.js";

/* Mounted at /api/teachers */
const router = express.Router();

router.post("/", permissionMiddleware("TEACHER", "CREATE"), auditMiddleware("TEACHER", "CREATE"), teacherController.createTeacher);
router.get("/", permissionMiddleware("TEACHER", "READ"), teacherController.getTeachers);
router.get("/:teacherId", permissionMiddleware("TEACHER", "READ"), teacherController.getTeacherById);
router.put("/:teacherId", permissionMiddleware("TEACHER", "UPDATE"), auditMiddleware("TEACHER", "UPDATE"), teacherController.updateTeacher);

export default router;
