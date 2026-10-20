import { defineTool } from "../../../../common/agent-tools/agentTools.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { z } from "../../../../common/validation/zod.js";
import { id } from "../../../../common/validation/schemas.js";
import { academicYearService } from "../../academic-years/index.js";
import { CLASS_TIMETABLE_MODES, SCHEDULING_KINDS, SCHEDULING_STATUSES } from "../constants/scheduling.constants.js";
import { SCHEDULING_PERMISSIONS as can } from "../permissions/scheduling.permissions.js";
import { examTimetablePlanner } from "../services/examTimetablePlanner.service.js";
import { schedulingRunService } from "../services/schedulingRun.service.js";
import { applyRequest, classTimetableRequest, examTimetableRequest } from "../validators/scheduling.validator.js";

/* Timetable generation as agent tools. The same services as the REST API; the results are
   shaped for a model to read: short, named, with what to do next. */

const academicYearId = () =>
  id()
    .optional()
    .describe("The academic year (default: the school's current year). Ids come from the school's records, not names.");

const yearOf = async (ctx, requested) => {
  const academicYear = requested
    ? await academicYearService.findById(ctx, requested)
    : await academicYearService.findCurrent(ctx);
  if (!academicYear) {
    throw unprocessable(
      requested
        ? "academicYearId does not refer to an academic year"
        : "No current academic year is set; send academicYearId"
    );
  }
  return academicYear;
};

const hhmm = time => (time ? time.slice(0, 5) : "");
const MAX_LISTED = 25;
const firstOf = (list, map) => ({ shown: list.slice(0, MAX_LISTED).map(map), total: list.length });

/* A run as an agent needs it to decide: how complete, what is wrong, what applying changes */
const brief = run => ({
  runId: run.id,
  kind: run.kind,
  status: run.status,
  summary: run.summary,
  seed: run.seed,
  complete: run.report.score.complete,
  score: run.report.score,
  changesOnApply: run.report.changes,
  problems: firstOf(run.report.issues, i => `${i.severity}: ${i.message}`),
  unplaced: firstOf(run.report.unplaced, u => u.message),
  createdAt: run.createdAt
});

/* A weekly grid as one line per day: "Monday": ["Maths · A. Rao", "free", "break", …] */
const compactGrid = (grid, view) => ({
  periods: grid.periods.map(
    p =>
      `${p.isBreak ? "" : `P${p.periodNumber} `}${p.name} ${hhmm(p.startTime)}–${hhmm(p.endTime)}${p.isBreak ? " (break)" : ""}`
  ),
  days: Object.fromEntries(
    grid.days.map(day => [
      day.name,
      grid.periods.map(period => {
        if (period.isBreak) return "break";
        const slot = day.slots.find(s => s.period.id === period.id);
        if (!slot) return "free";
        const who = view === "TEACHER" ? slot.section?.name : slot.teacher?.name;
        const status = slot.status && slot.status !== "NEW" ? ` [${slot.status.toLowerCase()}]` : "";
        return `${slot.subject?.subjectName ?? "?"} · ${who ?? "?"}${slot.room ? ` @ ${slot.room}` : ""}${status}`;
      })
    ])
  )
});

/* An exam draft as sittings: "2026-11-02 09:30–12:30 Mathematics: Class 6-A, Class 6-B" */
const examSittings = async (ctx, run) => {
  const papers = new Map((await examTimetablePlanner.papersOf(ctx, run.examId)).map(p => [p.id, p]));
  const sittings = new Map();
  for (const row of run.result.rows) {
    const paper = papers.get(row.paperId);
    if (!paper) continue;
    const subject = `${paper.subject.subjectName}${paper.component ? ` (${paper.component.toLowerCase()})` : ""}`;
    const key = `${row.examDate} ${row.startTime}–${row.endTime} ${subject}`;
    if (!sittings.has(key)) sittings.set(key, []);
    sittings.get(key).push(paper.section.sectionName);
  }
  return [...sittings.entries()].map(([key, sections]) => `${key}: sections ${sections.join(", ")}`);
};

defineTool({
  name: "get_timetable_inputs",
  title: "Look at what a class timetable is made from",
  description:
    "Shows what a class timetable for an academic year would be built from: the school days, the bell schedule (periods and breaks), each section's subjects with their classes a week and teacher, each teacher's weekly load, and problems found before solving (a subject without a teacher or without classes a week, a section or teacher with more classes than periods). Read-only. Use it before generate_class_timetable to see the ids of sections, subjects and teachers, and to fix or explain problems first.",
  input: z.object({
    academicYearId: academicYearId(),
    sectionIds: z
      .array(id())
      .min(1)
      .max(500)
      .optional()
      .describe("Only these sections (default: every section of the year)"),
    mode: z
      .enum(CLASS_TIMETABLE_MODES)
      .default("FILL")
      .describe("FILL counts the lessons already on the timetable as fixed; REPLACE ignores them")
  }),
  permission: can.read,
  readOnly: true,
  idempotent: true,
  handler: async (ctx, { academicYearId: yearId, ...rest }) => {
    const academicYear = await yearOf(ctx, yearId);
    const inputs = await schedulingRunService.classInputs(ctx, academicYear, classTimetableRequest.parse(rest));
    return { message: `${inputs.sections.length} sections, ${inputs.issues.length} problems found`, ...inputs };
  }
});

defineTool({
  name: "generate_class_timetable",
  title: "Generate a class timetable (draft)",
  description:
    "Plans the weekly class timetable of an academic year, or of some sections, and saves it as a draft. Nothing on the real timetable changes until apply_timetable_draft. Each section subject is placed as many times a week as its classes a week, with its assigned teacher. Hard rules are never broken: a section, teacher or room has one class at a time, teacher availability and daily limits hold, doubles are two periods in a row. Soft rules (spread over the week, no gaps, preferred periods) are balanced by weights. Returns the draft's runId, how many periods were placed, the problems and the classes it could not place with the reason. To get a different timetable, call again with another seed or changed rules; each call makes a new draft.",
  input: classTimetableRequest.extend({ academicYearId: academicYearId() }),
  permission: can.generate,
  handler: async (ctx, { academicYearId: yearId, ...request }, { origin }) => {
    const academicYear = await yearOf(ctx, yearId);
    const run = await schedulingRunService.generateClassTimetable(ctx, academicYear, request, { origin });
    return {
      message: `Draft timetable generated: ${run.summary}`,
      ...brief(run),
      next: run.report.score.complete
        ? "Review it with get_timetable_draft (a section's or teacher's week), then apply it with apply_timetable_draft once the person you work for agrees."
        : "Some classes could not be placed: read `unplaced` and `problems`, change the rules (or ask for teachers, periods or assignments to be changed) and generate again, or apply with allowIncomplete and add the rest by hand."
    };
  }
});

defineTool({
  name: "generate_exam_timetable",
  title: "Generate an exam timetable (draft)",
  description:
    "Gives every paper of an exam a date and a sitting, over the school days between startDate and endDate (holidays, vacations and weekly off days are skipped; other exams' papers are avoided), and saves it as a draft. Nothing changes until apply_timetable_draft. By default a subject's paper is sat at the same time by every section of a class, one paper a day per section, spread evenly over the window. The exam's papers must already exist. Returns the draft's runId, the first and last day, problems (a window too short for the papers) and papers it could not place.",
  input: examTimetableRequest,
  permission: can.generate,
  handler: async (ctx, request, { origin }) => {
    const run = await schedulingRunService.generateExamTimetable(ctx, request, { origin });
    return {
      message: `Draft exam timetable generated: ${run.summary}`,
      ...brief(run),
      next: run.report.score.complete
        ? "Review the sittings with get_timetable_draft, then apply it with apply_timetable_draft once the person you work for agrees."
        : "Some papers have no sitting: widen the window, allow more papers a day, add an afternoon sitting or lower minGapDays, then generate again. An exam timetable can only be applied complete."
    };
  }
});

defineTool({
  name: "list_timetable_drafts",
  title: "List generated timetables",
  description:
    "Lists the generated class and exam timetables of an academic year, newest first, with their status (DRAFT, APPLIED, DISCARDED) and summary. Read-only.",
  input: z.object({
    academicYearId: academicYearId(),
    kind: z.enum(SCHEDULING_KINDS).optional(),
    status: z.enum(SCHEDULING_STATUSES).optional(),
    examId: id().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }),
  permission: can.read,
  readOnly: true,
  idempotent: true,
  handler: async (ctx, { academicYearId: yearId, ...query }) => {
    const academicYear = await yearOf(ctx, yearId);
    const { rows, meta } = await schedulingRunService.list({ ...ctx, academicYearId: academicYear.id }, query);
    return {
      message: `${meta.total ?? rows.length} generated timetables`,
      runs: rows.map(run => ({
        runId: run.id,
        kind: run.kind,
        status: run.status,
        origin: run.origin,
        summary: run.summary,
        createdAt: run.createdAt,
        appliedAt: run.appliedAt
      })),
      meta
    };
  }
});

defineTool({
  name: "get_timetable_draft",
  title: "Look at a generated timetable",
  description:
    "Shows a generated timetable. For a class timetable: its summary and problems, and, given sectionId or teacherId, that week as it would be after applying (one line per day, each period 'Subject · Teacher' or 'Subject · Section', [kept] for lessons already there, [other] for a teacher's classes in sections the draft does not plan). For an exam timetable: every sitting with its date, time, subject and sections. Read-only.",
  input: z.object({
    runId: id(),
    sectionId: id().optional().describe("A section's week (class timetables)"),
    teacherId: id().optional().describe("A teacher's week (class timetables)")
  }),
  permission: can.read,
  readOnly: true,
  idempotent: true,
  handler: async (ctx, { runId, sectionId, teacherId }) => {
    const run = await schedulingRunService.getById(ctx, runId);
    const out = { message: run.summary, ...brief(run), request: run.request };
    if (run.kind === "EXAM_TIMETABLE") return { ...out, sittings: await examSittings(ctx, run) };
    if (sectionId) {
      const grid = await schedulingRunService.sectionPreview(ctx, runId, sectionId);
      return { ...out, section: grid.section.name, week: compactGrid(grid, "SECTION") };
    }
    if (teacherId) {
      const grid = await schedulingRunService.teacherPreview(ctx, runId, teacherId);
      return { ...out, teacherId, weeklyLessons: grid.weeklyLessons, week: compactGrid(grid, "TEACHER") };
    }
    return { ...out, sectionIds: run.result.sectionIds, hint: "Send sectionId or teacherId to see a week." };
  }
});

defineTool({
  name: "apply_timetable_draft",
  title: "Apply a generated timetable",
  description:
    "Writes a draft to the school's records: a class timetable's lessons (in REPLACE mode the planned sections' current lessons are removed first), or an exam's paper dates and times (its calendar event is created or updated). Applies once; refuses if the school's data changed since the draft was made (generate again then). Ask the person you work for before calling this: it changes what students and teachers see.",
  input: applyRequest.extend({ runId: id() }),
  permission: can.apply,
  destructive: true,
  handler: async (ctx, { runId, ...options }) => {
    const outcome = await schedulingRunService.apply(ctx, runId, options);
    const message =
      outcome.run.kind === "CLASS_TIMETABLE"
        ? `Timetable applied: ${outcome.added} lessons added, ${outcome.removed} removed, ${outcome.kept} kept`
        : `Exam timetable applied: ${outcome.scheduled} papers scheduled`;
    return { message, runId, status: outcome.run.status, ...outcome, run: undefined };
  }
});

defineTool({
  name: "discard_timetable_draft",
  title: "Discard a generated timetable",
  description: "Sets a draft aside so it can no longer be applied. Nothing else changes.",
  input: z.object({ runId: id() }),
  permission: can.apply,
  idempotent: true,
  handler: async (ctx, { runId }) => {
    const run = await schedulingRunService.discard(ctx, runId);
    return { message: "Draft discarded", runId, status: run.status };
  }
});
