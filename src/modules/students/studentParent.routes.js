import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as studentParentController from "./studentParent.controller.js";

/* Mounted at /api/student-parent-map */
const router = express.Router();

router.post("/", permissionMiddleware("STUDENT_PARENT", "CREATE"), auditMiddleware("STUDENT_PARENT", "CREATE"), studentParentController.mapStudentParent);
router.get("/student/:studentId", permissionMiddleware("STUDENT_PARENT", "READ"), studentParentController.getParentsByStudent);
router.delete("/:mapId", permissionMiddleware("STUDENT_PARENT", "DELETE"), auditMiddleware("STUDENT_PARENT", "DELETE"), studentParentController.removeStudentParentMap);

export default router;
