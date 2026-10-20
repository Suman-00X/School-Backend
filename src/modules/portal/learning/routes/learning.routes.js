import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { learningController as controller } from "../controllers/learning.controller.js";
import { LEARNING_PERMISSIONS as can } from "../permissions/learning.permissions.js";
import { learningValidators as rules } from "../validators/learning.validator.js";

/* /api/v1/me: what a student, parent or teacher sees about their own school life */
const router = createRouter();

router.get("/students", authorize(can.students), controller.students);
router.get("/students/:studentId/timetable", authorize(can.students), validate(rules.student), controller.timetable);
router.get(
  "/students/:studentId/attendance",
  authorize(can.students),
  validate(rules.attendance),
  controller.attendance
);
router.get(
  "/students/:studentId/report-cards",
  authorize(can.students),
  validate(rules.reportCards),
  controller.reportCards
);

router.get(
  "/students/:studentId/report-cards/pdf",
  authorize(can.students),
  validate(rules.reportCardPdf),
  controller.reportCardPdf
);

/* Admit cards the school has issued (exam eligibility met) */
router.get("/students/:studentId/admit-cards", authorize(can.students), validate(rules.student), controller.admitCards);
router.get(
  "/students/:studentId/admit-cards/:admitCardId/pdf",
  authorize(can.students),
  validate(rules.admitCard),
  controller.admitCardPdf
);

router.get("/calendar", authorize(can.calendar), validate(rules.calendar), inYear, controller.calendar);

router.get("/teaching/timetable", authorize(can.teaching), controller.teacherTimetable);
router.get("/teaching/sections", authorize(can.teaching), controller.teacherSections);

export default router;
