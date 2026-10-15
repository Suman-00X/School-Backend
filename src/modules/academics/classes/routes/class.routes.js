import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { classController as controller } from "../controllers/class.controller.js";
import { CLASS_PERMISSIONS as can } from "../permissions/class.permissions.js";
import { classValidators as rules } from "../validators/class.validator.js";

/* /api/v1/academics/classes (shared across academic years) */
const router = Router();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.post("/bulk", authorize(can.create), validate(rules.createMany), controller.createMany);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:classId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:classId", authorize(can.update), validate(rules.update), controller.update);

export default router;
