import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { schedulingController as controller } from "../controllers/scheduling.controller.js";
import { SCHEDULING_PERMISSIONS as can } from "../permissions/scheduling.permissions.js";
import { schedulingValidators as rules } from "../validators/scheduling.validator.js";

/* /api/v1/academics/scheduling: generated class and exam timetables (drafts until applied) */
const router = createRouter();

/* Class timetables: the year in X-Academic-Year-Id (or the current year) */
router.get("/class-timetable/inputs", authorize(can.read), validate(rules.classInputs), inYear, controller.classInputs);
router.post(
  "/class-timetable/runs",
  authorize(can.generate),
  validate(rules.generateClass),
  inYear,
  controller.generateClass
);

/* Exam timetables: the exam's own year */
router.post("/exam-timetable/runs", authorize(can.generate), validate(rules.generateExam), controller.generateExam);

router.get("/runs", authorize(can.read), validate(rules.listRuns), inYear, controller.listRuns);
router.get("/runs/:runId", authorize(can.read), validate(rules.getRun), controller.getRun);
router.get(
  "/runs/:runId/sections/:sectionId",
  authorize(can.read),
  validate(rules.sectionGrid),
  controller.sectionGrid
);
router.get(
  "/runs/:runId/teachers/:teacherId",
  authorize(can.read),
  validate(rules.teacherGrid),
  controller.teacherGrid
);
router.post("/runs/:runId/apply", authorize(can.apply), validate(rules.apply), controller.apply);
router.post("/runs/:runId/discard", authorize(can.apply), validate(rules.discard), controller.discard);

export default router;
