import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as parentController from "./parent.controller.js";

/* Mounted at /api/parents */
const router = express.Router();

router.post("/", permissionMiddleware("PARENT", "CREATE"), auditMiddleware("PARENT", "CREATE"), parentController.createParent);
router.get("/", permissionMiddleware("PARENT", "READ"), parentController.getParents);
router.get("/:parentId", permissionMiddleware("PARENT", "READ"), parentController.getParentById);
router.put("/:parentId", permissionMiddleware("PARENT", "UPDATE"), auditMiddleware("PARENT", "UPDATE"), parentController.updateParent);

export default router;
