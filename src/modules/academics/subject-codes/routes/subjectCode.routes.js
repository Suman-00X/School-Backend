import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { subjectCodeController as controller } from "../controllers/subjectCode.controller.js";
import { SUBJECT_CODE_PERMISSIONS as can } from "../permissions/subjectCode.permissions.js";
import { subjectCodeValidators as rules } from "../validators/subjectCode.validator.js";

/* /api/v1/academics/subject-codes */
const router = createRouter();

router.get("/slots", authorize(can.read), controller.getSlots);
router.put("/slots", authorize(can.manage), validate(rules.saveSlots), controller.saveSlots);

export default router;
