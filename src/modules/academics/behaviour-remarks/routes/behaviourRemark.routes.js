import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { behaviourRemarkController as controller } from "../controllers/behaviourRemark.controller.js";
import { BEHAVIOUR_REMARK_PERMISSIONS as can } from "../permissions/behaviourRemark.permissions.js";
import { behaviourRemarkValidators as rules } from "../validators/behaviourRemark.validator.js";

/* /api/v1/academics/behaviour-remarks: students' behaviour log books, in the header's year */
const router = createRouter();

router.post("/", authorize(can.record), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/students/:studentId/summary", authorize(can.read), validate(rules.summary), inYear, controller.summary);
router.get("/:remarkId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:remarkId", authorize(can.record), validate(rules.update), inYear, controller.update);
router.delete("/:remarkId", authorize(can.record), validate(rules.getById), inYear, controller.remove);

export default router;
