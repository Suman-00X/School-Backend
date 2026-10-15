import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { reportCardController as controller } from "../controllers/reportCard.controller.js";
import { REPORT_CARD_PERMISSIONS as can } from "../permissions/reportCard.permissions.js";
import { reportCardValidators as rules } from "../validators/reportCard.validator.js";

/* /api/v1/academics/report-cards (computed from marks; nothing is stored) */
const router = createRouter();

router.get("/sections/:sectionId", authorize(can.read), validate(rules.section), controller.section);
router.get("/students/:studentId", authorize(can.read), validate(rules.student), controller.student);

export default router;
