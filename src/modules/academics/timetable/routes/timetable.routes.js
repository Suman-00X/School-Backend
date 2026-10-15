import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { timetableController as controller } from "../controllers/timetable.controller.js";
import { TIMETABLE_PERMISSIONS as can } from "../permissions/timetable.permissions.js";
import { timetableValidators as rules } from "../validators/timetable.validator.js";

/* /api/v1/academics/timetable */
const router = createRouter();

router.post("/slots", authorize(can.manage), validate(rules.createSlot), controller.create);
router.patch("/slots/:slotId", authorize(can.manage), validate(rules.updateSlot), controller.update);
router.delete("/slots/:slotId", authorize(can.manage), validate(rules.removeSlot), controller.remove);

router.get("/sections/:sectionId", authorize(can.read), validate(rules.sectionGrid), controller.forSection);
router.get("/teachers/:teacherId", authorize(can.read), validate(rules.teacherGrid), inYear, controller.forTeacher);

export default router;
