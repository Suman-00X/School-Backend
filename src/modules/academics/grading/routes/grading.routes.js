import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { gradingController as controller } from "../controllers/grading.controller.js";
import { GRADING_PERMISSIONS as can } from "../permissions/grading.permissions.js";
import { gradingValidators as rules } from "../validators/grading.validator.js";

/* /api/v1/academics/grade-scales */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/templates", authorize(can.read), validate(rules.templates), controller.templates);
router.get("/:gradeScaleId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:gradeScaleId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:gradeScaleId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
