import { eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { sectionService } from "../../sections/index.js";
import { subjectService } from "../../subjects/index.js";
import { substitutionService } from "../../substitutions/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import { schedulingRuns } from "../models/schedulingRun.schema.js";
import { schedulingRunRepository, schedulingRunSummaryRepository } from "../repositories/schedulingRun.repository.js";
import { changedParts } from "../utils/fingerprint.util.js";
import { classTimetablePlanner } from "./classTimetablePlanner.service.js";
import { examTimetablePlanner } from "./examTimetablePlanner.service.js";

/* Scheduling runs: generate a draft, look at it, then apply or discard it.
   Generating never changes the timetable or the exam; applying does, once, and only while
   the school's data still matches what the draft was made from. */

const CHANGED = {
  scope: "the sections being planned",
  periods: "the bell schedule",
  days: "the school days",
  subjects: "the sections' subjects or their classes a week",
  teachers: "the teacher assignments",
  timetable: "the timetable",
  request: "the request",
  papers: "the exam's papers",
  otherExams: "other exams' timetables"
};

const listOf = parts => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]);

const loadRun = async (ctx, runId) => {
  const run = await schedulingRunRepository.findById(ctx.tenantId, runId);
  if (!run) throw notFound("Scheduling run");
  return run;
};

const assertDraft = run => {
  if (run.status !== "DRAFT")
    throw conflict(`This draft was already ${run.status === "APPLIED" ? "applied" : "discarded"}`);
};

const assertWritableYear = async (ctx, academicYearId) => {
  const academicYear = await academicYearService.findById(ctx, academicYearId);
  if (academicYear.archivedAt) throw conflict(`Academic year ${academicYear.yearName} is archived and read-only`);
  return academicYear;
};

/* DRAFT -> status, only once (two people applying at the same moment: one wins) */
const claim = async (ctx, runId, values, { dbc } = {}) => {
  const row = await schedulingRunRepository.update(ctx.tenantId, runId, values, {
    dbc,
    conditions: [eq(schedulingRuns.status, "DRAFT")]
  });
  if (!row) throw conflict("This draft was already applied or discarded");
  return row;
};

const assertUnchanged = (run, now) => {
  const changed = changedParts(run.fingerprint, now);
  if (changed.length) {
    throw conflict(
      `Since this draft was made, ${listOf(changed.map(part => CHANGED[part] ?? part))} changed. Generate a new draft.`
    );
  }
};

const pick = (row, keys) => (row ? Object.fromEntries(keys.map(key => [key, row[key]])) : null);

/* Slot objects in the shape the timetable's grid expects (see timetableService.grid) */
const previewSlots = async (ctx, academicYearId, entries) => {
  const subjectIds = [...new Set(entries.map(e => e.subjectId))];
  const teacherIds = [...new Set(entries.map(e => e.teacherId))];
  const sectionIds = [...new Set(entries.map(e => e.sectionId))];
  const [periods, subjects, teachers, sections] = await Promise.all([
    periodService.findAllInYear(ctx, academicYearId),
    subjectService.findManyByIds(ctx, subjectIds),
    teacherService.findActiveByIds(ctx, teacherIds),
    sectionService.findAllInYear(ctx, academicYearId)
  ]);
  const by = list => new Map(list.map(row => [row.id, row]));
  const [periodById, subjectById, teacherById, sectionById] = [
    by(periods),
    by(subjects),
    by(teachers),
    by(sections.filter(s => sectionIds.includes(s.id)))
  ];
  const slots = entries.map(e => ({
    id: e.id ?? null,
    weekday: e.weekday,
    period: pick(periodById.get(e.periodId), ["id", "periodNumber", "name", "startTime", "endTime"]),
    subject: pick(subjectById.get(e.subjectId), ["id", "subjectName", "subjectCode"]),
    teacher: teacherById.get(e.teacherId) ?? null,
    section: sectionById.get(e.sectionId) ?? null,
    room: e.room ?? null
  }));
  return { periods, slots: slots.filter(s => s.period) };
};

/* The grid, each lesson marked NEW (the draft adds it), PINNED, KEPT (stays) or OTHER
   (a section the draft does not plan) */
const markedGrid = (periods, slots, entries, academicYear) => {
  const grid = timetableService.grid(periods, slots, academicYear.weeklyOffDays);
  const status = new Map(entries.map(e => [`${e.weekday}|${e.periodId}|${e.sectionId}`, e.status]));
  for (const day of grid.days) {
    for (const slot of day.slots)
      slot.status = status.get(`${day.weekday}|${slot.period.id}|${slot.section?.id}`) ?? "NEW";
  }
  return grid;
};

const present = run => ({
  id: run.id,
  kind: run.kind,
  status: run.status,
  origin: run.origin,
  academicYearId: run.academicYearId,
  examId: run.examId,
  seed: run.seed,
  summary: run.summary,
  request: run.request,
  report: run.report,
  ...(run.result && { result: run.result }),
  createdBy: run.createdBy,
  createdAt: run.createdAt,
  appliedAt: run.appliedAt,
  appliedBy: run.appliedBy,
  discardedAt: run.discardedAt
});

const save = (ctx, academicYearId, kind, origin, planned) =>
  schedulingRunRepository.create(ctx.tenantId, {
    academicYearId,
    kind,
    origin,
    examId: planned.examId ?? null,
    seed: planned.seed,
    request: planned.request,
    result: planned.result,
    report: planned.report,
    fingerprint: planned.fingerprint,
    summary: planned.summary,
    createdBy: ctx.userId
  });

export const schedulingRunService = {
  /* What a class timetable for the year (or some sections) would be made from, and its problems */
  classInputs: (ctx, academicYear, request) => classTimetablePlanner.inputs(ctx, academicYear, request),

  /* A draft class timetable for the year in ctx (or some of its sections) */
  generateClassTimetable: async (ctx, academicYear, request, { origin = "API" } = {}) => {
    await assertWritableYear(ctx, academicYear.id);
    const planned = await classTimetablePlanner.plan(ctx, academicYear, request);
    return present(await save(ctx, academicYear.id, "CLASS_TIMETABLE", origin, planned));
  },

  /* A draft timetable for an exam (in the exam's own academic year) */
  generateExamTimetable: async (ctx, request, { origin = "API" } = {}) => {
    const planned = await examTimetablePlanner.plan(ctx, request);
    return present(await save(ctx, planned.academicYear.id, "EXAM_TIMETABLE", origin, planned));
  },

  /* Runs of the year in ctx, newest first, without their proposed timetables */
  list: async (ctx, { page, limit, kind, status, examId }) => {
    const result = await schedulingRunSummaryRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        eq(schedulingRuns.academicYearId, ctx.academicYearId),
        kind && eq(schedulingRuns.kind, kind),
        status && eq(schedulingRuns.status, status),
        examId && eq(schedulingRuns.examId, examId)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(present) };
  },

  getById: async (ctx, runId) => present(await loadRun(ctx, runId)),

  /* A section's week as the draft would leave it */
  sectionPreview: async (ctx, runId, sectionId) => {
    const run = await loadRun(ctx, runId);
    if (run.kind !== "CLASS_TIMETABLE") throw unprocessable("This run is an exam timetable; it has no weekly grid");
    if (!run.result.sectionIds.includes(sectionId)) throw notFound("Section in this draft");
    const academicYear = await academicYearService.findById(ctx, run.academicYearId);
    const keep = new Set(run.result.keepSlotIds);
    const kept = (await timetableService.lessonsOf(ctx, sectionId)).filter(slot => keep.has(slot.id));
    const entries = [
      ...kept.map(slot => ({ ...slot, status: "KEPT" })),
      ...run.result.placements
        .filter(p => p.sectionId === sectionId)
        .map(p => ({ ...p, status: p.pinned ? "PINNED" : "NEW" }))
    ];
    const { periods, slots } = await previewSlots(ctx, run.academicYearId, entries);
    const section = slots[0]?.section ?? (await sectionService.findById(ctx, sectionId));
    return {
      runId: run.id,
      runStatus: run.status,
      section: { id: sectionId, name: `${section.class?.className}-${section.sectionName}` },
      academicYearId: run.academicYearId,
      ...markedGrid(periods, slots, entries, academicYear)
    };
  },

  /* A teacher's week as the draft would leave it (their classes in other sections included) */
  teacherPreview: async (ctx, runId, teacherId) => {
    const run = await loadRun(ctx, runId);
    if (run.kind !== "CLASS_TIMETABLE") throw unprocessable("This run is an exam timetable; it has no weekly grid");
    const academicYear = await academicYearService.findById(ctx, run.academicYearId);
    const planned = new Set(run.result.sectionIds);
    const keep = new Set(run.result.keepSlotIds);
    const current = (await timetableService.lessonsInYear(ctx, run.academicYearId)).filter(
      slot => slot.teacherId === teacherId && (!planned.has(slot.sectionId) || keep.has(slot.id))
    );
    const entries = [
      ...current.map(slot => ({ ...slot, status: planned.has(slot.sectionId) ? "KEPT" : "OTHER" })),
      ...run.result.placements
        .filter(p => p.teacherId === teacherId)
        .map(p => ({ ...p, status: p.pinned ? "PINNED" : "NEW" }))
    ];
    const { periods, slots } = await previewSlots(ctx, run.academicYearId, entries);
    return {
      runId: run.id,
      runStatus: run.status,
      teacherId,
      academicYearId: run.academicYearId,
      weeklyLessons: slots.length,
      ...markedGrid(periods, slots, entries, academicYear)
    };
  },

  /* Writes the draft: the class timetable's slots, or the exam's paper dates and times (through
     the exam's calendar event, created when it has none) */
  apply: async (ctx, runId, { allowIncomplete = false } = {}) => {
    const run = await loadRun(ctx, runId);
    assertDraft(run);
    const academicYear = await assertWritableYear(ctx, run.academicYearId);
    const { score } = run.report;

    if (run.kind === "CLASS_TIMETABLE") {
      assertUnchanged(run, await classTimetablePlanner.currentFingerprint(ctx, academicYear, run.request));
      const missing = score.requiredPeriods - score.placedPeriods;
      if (missing > 0 && !allowIncomplete) {
        throw unprocessable(
          `This draft leaves ${missing} period${missing === 1 ? "" : "s"} unplaced. Apply it with allowIncomplete to add them by hand, or change the rules and generate again.`
        );
      }
      const { applied, added, cancelled } = await transaction(async dbc => {
        const applied = await claim(
          ctx,
          runId,
          { status: "APPLIED", appliedAt: new Date(), appliedBy: ctx.userId },
          { dbc }
        );
        const slots = run.result.placements.map(({ sectionId, subjectId, teacherId, weekday, periodId, room }) => ({
          sectionId,
          subjectId,
          teacherId,
          weekday,
          periodId,
          room
        }));
        /* REPLACE: the removed lessons' substitution plans for today and later go with them */
        const { added, cancelled } = await timetableService.replaceSlots(
          ctx,
          run.academicYearId,
          { removeSlotIds: run.result.removeSlotIds, slots },
          { dbc }
        );
        return { applied, added, cancelled };
      });
      await substitutionService.notifyCancelled(ctx, cancelled);
      return {
        run: present(applied),
        added: added.length,
        removed: run.result.removeSlotIds.length,
        kept: run.result.keepSlotIds.length,
        substitutionsCancelled: cancelled.length
      };
    }

    /* EXAM_TIMETABLE: every paper needs its date and time */
    assertUnchanged(run, await examTimetablePlanner.currentFingerprint(ctx, run.request));
    if (!score.complete) {
      throw unprocessable(
        `This draft leaves ${score.requiredPapers - score.placedPapers} papers without a date. An exam's timetable must give every paper one: change the rules (more days, more papers a day, another sitting) and generate again.`
      );
    }
    const timetable = run.result.rows.map(({ paperId, examDate, startTime, endTime }) => ({
      paperId,
      examDate,
      startTime,
      endTime
    }));
    /* The calendar writes in its own transaction, so the claim's transaction stays open around
       it: the run's row stays locked (a second apply waits, then finds it applied), and the run
       is APPLIED only when the write succeeded. A failure or a crash rolls the claim back and
       the draft stays a draft. */
    const applied = await transaction(async dbc => {
      const claimed = await claim(
        ctx,
        runId,
        { status: "APPLIED", appliedAt: new Date(), appliedBy: ctx.userId },
        { dbc }
      );
      const yearCtx = { ...ctx, academicYearId: academicYear.id, academicYear };
      const event = await calendarService.findForExam(ctx, run.examId);
      if (event) await calendarService.update(yearCtx, event.id, { timetable });
      else await calendarService.create(yearCtx, { eventType: "EXAM", examId: run.examId, timetable });
      return claimed;
    });
    return { run: present(applied), scheduled: timetable.length };
  },

  discard: async (ctx, runId) => {
    assertDraft(await loadRun(ctx, runId));
    return present(await claim(ctx, runId, { status: "DISCARDED", discardedAt: new Date() }));
  }
};
