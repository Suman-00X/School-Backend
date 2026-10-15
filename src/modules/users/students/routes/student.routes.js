import { Router } from "express";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { studentController as controller } from "../controllers/student.controller.js";
import { studentParentController as parents } from "../controllers/studentParent.controller.js";
import { STUDENT_PERMISSIONS as can } from "../permissions/student.permissions.js";
import { studentValidators as rules } from "../validators/student.validator.js";

/* /api/v1/users/students */
const router = Router();

/* Creating a student is an admission */
router.post("/", authorize(can.admit), validate(rules.admit), controller.admit);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:studentId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:studentId", authorize(can.update), validate(rules.update), controller.update);

/* /api/v1/users/students/:studentId/parents */
router.get("/:studentId/parents", authorize(can.readParents), validate(rules.listParents), parents.list);
router.post("/:studentId/parents", authorize(can.manageParents), validate(rules.linkParent), parents.link);
router.delete("/:studentId/parents/:parentId", authorize(can.manageParents), validate(rules.unlinkParent), parents.unlink);

export default router;
