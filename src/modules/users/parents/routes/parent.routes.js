import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { parentController as controller } from "../controllers/parent.controller.js";
import { PARENT_PERMISSIONS as can } from "../permissions/parent.permissions.js";
import { parentValidators as rules } from "../validators/parent.validator.js";

/* /api/v1/users/parents */
const router = Router();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:parentId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:parentId", authorize(can.update), validate(rules.update), controller.update);

export default router;
