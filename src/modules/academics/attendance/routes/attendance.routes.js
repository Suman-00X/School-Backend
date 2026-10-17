import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { attendanceController as controller } from "../controllers/attendance.controller.js";
import { freePeriodController as freePeriods } from "../controllers/freePeriod.controller.js";
import { ATTENDANCE_PERMISSIONS as can } from "../permissions/attendance.permissions.js";
import { attendanceValidators as rules } from "../validators/attendance.validator.js";

/* /api/v1/academics/attendance. The section decides the academic year. */
const router = createRouter();

/* Recording is idempotent per (section, date, kind, period). The policy also sets the
   school's mode (DAILY, TWO_SESSIONS, PERIOD_WISE), the same for every class, from a date on. */
router.get("/policy", authorize(can.read), controller.getPolicy);
router.patch("/policy", authorize(can.managePolicy), validate(rules.updatePolicy), controller.updatePolicy);
router.post("/", authorize(can.record), validate(rules.record), controller.record);
router.get("/register", authorize(can.read), validate(rules.register), controller.register);
router.get("/summary", authorize(can.read), validate(rules.summary), controller.summary);
/* Registers nobody took, and who answers for each. `inYear` unless sectionId names one. */
router.get(
  "/missing-registers",
  authorize(can.readMissingRegisters),
  validate(rules.missingRegisters),
  inYear,
  controller.missingRegisters
);
/* Covering a period today: my sections taking attendance by period, then one section's
   periods and subjects; then GET /register?…&periodNumber= opens the student list */
router.get("/cover", authorize(can.record), controller.coverSections);
router.get("/cover/:sectionId", authorize(can.record), validate(rules.cover), controller.coverSection);
/* Free periods: nobody of the section can take the period; idempotent per (section, date, period) */
router.get("/free-periods", authorize(can.read), validate(rules.listFree), freePeriods.list);
router.post("/free-periods", authorize(can.manageFreePeriods), validate(rules.markFree), freePeriods.mark);
router.delete(
  "/free-periods/:freePeriodId",
  authorize(can.manageFreePeriods),
  validate(rules.removeFree),
  freePeriods.remove
);
router.get("/students/:studentId", authorize(can.read), validate(rules.student), controller.student);

export default router;
