import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as classController from "./class.controller.js";

/* Mounted at /api/academic/classes (shared across academic years) */
const router = express.Router();

router.post("/bulk", permissionMiddleware("CLASS", "BULK"), auditMiddleware("CLASS", "BULK"), classController.createClassesBulk);
router.post("/", permissionMiddleware("CLASS", "CREATE"), auditMiddleware("CLASS", "CREATE"), classController.createClass);
router.get("/", permissionMiddleware("CLASS", "READ"), classController.getClasses);
router.get("/:classId", permissionMiddleware("CLASS", "READ"), classController.getClassById);
router.put("/:classId", permissionMiddleware("CLASS", "UPDATE"), auditMiddleware("CLASS", "UPDATE"), classController.updateClass);

export default router;
