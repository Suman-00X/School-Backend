import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { teacherController as controller } from "../controllers/teacher.controller.js";
import { TEACHER_PERMISSIONS as can } from "../permissions/teacher.permissions.js";
import { teacherValidators as rules } from "../validators/teacher.validator.js";

/* /api/v1/users/teachers */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:teacherId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:teacherId", authorize(can.update), validate(rules.update), controller.update);

export default router;
