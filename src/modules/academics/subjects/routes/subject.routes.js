import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { subjectController as controller } from "../controllers/subject.controller.js";
import { SUBJECT_PERMISSIONS as can } from "../permissions/subject.permissions.js";
import { subjectValidators as rules } from "../validators/subject.validator.js";

/* /api/v1/academics/subjects (shared across academic years) */
const router = Router();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.post("/bulk", authorize(can.create), validate(rules.createMany), controller.createMany);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:subjectId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:subjectId", authorize(can.update), validate(rules.update), controller.update);

export default router;
