import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { diaryController as controller } from "../controllers/diary.controller.js";
import { DIARY_PERMISSIONS as can } from "../permissions/diary.permissions.js";
import { diaryValidators as rules } from "../validators/diary.validator.js";

/* /api/v1/academics/diary: each section's daily diary, in the header's year */
const router = createRouter();

router.post("/entries", authorize(can.write), validate(rules.create), inYear, controller.create);
router.patch("/entries/:entryId", authorize(can.write), validate(rules.update), inYear, controller.update);
router.delete("/entries/:entryId", authorize(can.write), validate(rules.remove), inYear, controller.remove);
router.get("/sections/:sectionId/days", authorize(can.read), validate(rules.days), inYear, controller.days);
router.get("/sections/:sectionId/day", authorize(can.read), validate(rules.day), inYear, controller.day);
router.get("/sections/:sectionId/signatures", authorize(can.read), validate(rules.day), inYear, controller.signatures);

export default router;
