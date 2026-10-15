import express from "express";
import { permissionMiddleware } from "../../common/middlewares/permission.middleware.js";
import { auditMiddleware } from "../../common/middlewares/audit.middleware.js";
import * as userController from "./user.controller.js";

/* Mounted at /api/users */
const router = express.Router();

router.post("/", permissionMiddleware("USER", "CREATE"), auditMiddleware("USER", "CREATE"), userController.createUser);
router.get("/", permissionMiddleware("USER", "READ"), userController.getUsers);
router.get("/:userId", permissionMiddleware("USER", "READ"), userController.getUserById);
router.put("/:userId", permissionMiddleware("USER", "UPDATE"), auditMiddleware("USER", "UPDATE"), userController.updateUser);
router.delete("/:userId", permissionMiddleware("USER", "DELETE"), auditMiddleware("USER", "DELETE"), userController.deactivateUser);

export default router;
