import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { portalDiaryController as controller } from "../controllers/diary.controller.js";
import { PORTAL_DIARY_PERMISSIONS as can } from "../permissions/diary.permissions.js";
import { portalDiaryValidators as rules } from "../validators/diary.validator.js";

/* /api/v1/me: the daily diary of the signed-in student or a parent's children */
const router = createRouter();

router.get("/students/:studentId/diary/days", authorize(can.read), validate(rules.days), inYear, controller.days);
router.get("/students/:studentId/diary/day", authorize(can.read), validate(rules.day), inYear, controller.day);
router.put("/students/:studentId/diary/signature", authorize(can.sign), validate(rules.sign), inYear, controller.sign);

export default router;
