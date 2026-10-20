import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { schedulingRunService } from "../services/schedulingRun.service.js";
import { classTimetableRequest } from "../validators/scheduling.validator.js";

export const schedulingController = {
  classInputs: async (req, res) =>
    ok(
      res,
      await schedulingRunService.classInputs(
        req.context,
        req.context.academicYear,
        classTimetableRequest.parse(req.query)
      ),
      "Timetable inputs retrieved successfully"
    ),

  generateClass: async (req, res) => {
    const run = await schedulingRunService.generateClassTimetable(req.context, req.context.academicYear, req.body);
    return created(res, run, `Draft timetable generated: ${run.summary}`);
  },

  generateExam: async (req, res) => {
    const run = await schedulingRunService.generateExamTimetable(req.context, req.body);
    return created(res, run, `Draft exam timetable generated: ${run.summary}`);
  },

  listRuns: async (req, res) =>
    paginated(res, await schedulingRunService.list(req.context, req.query), "Scheduling runs retrieved successfully"),

  getRun: async (req, res) =>
    ok(res, await schedulingRunService.getById(req.context, req.params.runId), "Scheduling run retrieved successfully"),

  sectionGrid: async (req, res) =>
    ok(
      res,
      await schedulingRunService.sectionPreview(req.context, req.params.runId, req.params.sectionId),
      "Draft section timetable retrieved successfully"
    ),

  teacherGrid: async (req, res) =>
    ok(
      res,
      await schedulingRunService.teacherPreview(req.context, req.params.runId, req.params.teacherId),
      "Draft teacher timetable retrieved successfully"
    ),

  apply: async (req, res) => {
    const outcome = await schedulingRunService.apply(req.context, req.params.runId, req.body);
    const message =
      outcome.run.kind === "CLASS_TIMETABLE"
        ? `Timetable applied: ${outcome.added} lessons added${outcome.removed ? `, ${outcome.removed} removed` : ""}${outcome.kept ? `, ${outcome.kept} kept` : ""}${outcome.substitutionsCancelled ? `, ${outcome.substitutionsCancelled} substitution plans cancelled` : ""}`
        : `Exam timetable applied: ${outcome.scheduled} papers scheduled`;
    return ok(res, outcome, message);
  },

  discard: async (req, res) => {
    await schedulingRunService.discard(req.context, req.params.runId);
    return done(res, "Draft discarded");
  }
};
