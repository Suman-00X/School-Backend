import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as studentController from "./student.controller.js";
import * as admissionController from "./admission.controller.js";

/* Mounted at /api/students */
const router = express.Router();

router.post("/admission", permissionMiddleware("STUDENT", "CREATE"), auditMiddleware("STUDENT_ADMISSION", "CREATE"), admissionController.addStudent);
router.post("/", permissionMiddleware("STUDENT", "CREATE"), auditMiddleware("STUDENT", "CREATE"), studentController.createStudent);
router.get("/", permissionMiddleware("STUDENT", "READ"), studentController.getStudents);
router.get("/:studentId", permissionMiddleware("STUDENT", "READ"), studentController.getStudentById);
router.put("/:studentId", permissionMiddleware("STUDENT", "UPDATE"), auditMiddleware("STUDENT", "UPDATE"), studentController.updateStudent);

export default router;
