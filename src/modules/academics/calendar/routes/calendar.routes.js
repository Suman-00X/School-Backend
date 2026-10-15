import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { calendarController as controller } from "../controllers/calendar.controller.js";
import { CALENDAR_PERMISSIONS as can } from "../permissions/calendar.permissions.js";
import { calendarValidators as rules } from "../validators/calendar.validator.js";

/* /api/v1/academics/calendar */
const router = createRouter();

router.get("/working-days", authorize(can.read), validate(rules.workingDays), inYear, controller.workingDays);

router.post("/events", authorize(can.create), validate(rules.create), inYear, controller.create);
router.get("/events", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/events/:eventId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/events/:eventId", authorize(can.update), validate(rules.update), controller.update);
router.delete("/events/:eventId", authorize(can.remove), validate(rules.remove), controller.remove);

export default router;
