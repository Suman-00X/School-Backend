import { and, eq, gte, lte } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { eachDay, maxDate, minDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { isWeeklyOff } from "../../academic-years/utils/weeklyOff.util.js";
import { classService } from "../../classes/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import {
  CALENDAR_EVENT_CATEGORIES,
  MAX_HOLIDAY_DAYS,
  NON_WORKING_EVENT_TYPES,
  STAFF_MEETING_CATEGORIES
} from "../../shared/constants/academic.constants.js";
import { calendarEvents } from "../models/calendarEvent.schema.js";
import { calendarEventRepository } from "../repositories/calendarEvent.repository.js";

const base = createCrudService(calendarEventRepository, { entity: "Calendar event" });

/* Events overlapping [from, to] */
const overlapping = (from, to) => and(lte(calendarEvents.startDate, to), gte(calendarEvents.endDate, from));

/* "09:00" -> "09:00:00" (stored form, compares as a string) */
const toTime = value => (value && value.length === 5 ? `${value}:00` : value);

const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

const assertInYear = (academicYear, { startDate, endDate }) => {
  if (startDate < academicYear.startDate || endDate > academicYear.endDate) {
    throw unprocessable(
      `Event dates must fall within the academic year (${academicYear.startDate} to ${academicYear.endDate})`
    );
  }
};

/* "Mathematics for A on 2026-11-14" */
const paperOn = paper => `${paper.subject.subjectName} (section ${paper.section.sectionName}) on ${paper.examDate}`;

/* A day the school is closed cannot have exam papers */
const assertNoPapers = async (ctx, academicYearId, { startDate, endDate }) => {
  const papers = await examPaperService.findScheduledBetween(ctx, academicYearId, startDate, endDate);
  if (papers.length) {
    throw conflict(
      `The school would be closed while exam papers are sat: ${paperOn(papers[0])}${papers.length > 1 ? ` and ${papers.length - 1} more` : ""}. Move the papers first, or keep the school open.`
    );
  }
};

/* What each type asks for, on the event as it will be stored (create, or stored + PATCH):
   - Holiday: a kind; up to MAX_HOLIDAY_DAYS days; closes the school; no hours or classes
   - Vacation: a kind; two days or more; closes the school; no hours or classes
   - Exam: an exam and its timetable (dates come from it); never closes the school
   - Event: a kind; hours optional (both or neither); some classes or the whole school
   - Meeting: a kind; one day with its hours; staff meetings have no classes; never closes
   - Other: a title; hours optional
   A closing event may not cover a day with exam papers. Returns the row to store. */
const shape = async (ctx, academicYear, event) => {
  const { eventType } = event;
  const categories = CALENDAR_EVENT_CATEGORIES[eventType];
  const row = { ...event, endDate: event.endDate ?? event.startDate };

  if (categories) {
    if (!row.category) throw unprocessable(`Pick what kind of ${eventType.toLowerCase()} it is`);
    if (!categories.includes(row.category)) throw unprocessable(`${row.category} is not a kind of ${eventType.toLowerCase()}`);
  } else row.category = null;
  if (eventType !== "EXAM" && !row.title) throw unprocessable("Give the event a title");

  const hasTimes = !!(row.startTime || row.endTime);
  if (row.startTime && !row.endTime) throw unprocessable("Give the end time too");
  if (row.endTime && !row.startTime) throw unprocessable("Give the start time too");
  const classIds = row.classIds?.length ? [...new Set(row.classIds)] : null;

  switch (eventType) {
    case "HOLIDAY":
    case "VACATION": {
      if (hasTimes) throw unprocessable(`A ${eventType.toLowerCase()} lasts whole days: it has no start or end time`);
      if (classIds) throw unprocessable(`A ${eventType.toLowerCase()} closes the whole school: it has no classes`);
      const days = dayCount(row.startDate, row.endDate);
      if (eventType === "HOLIDAY" && days > MAX_HOLIDAY_DAYS) {
        throw unprocessable(`A holiday is at most ${MAX_HOLIDAY_DAYS} days; add a longer break as a vacation`);
      }
      if (eventType === "VACATION" && days < 2) throw unprocessable("A vacation is two days or more; add a single day off as a holiday");
      Object.assign(row, { isHoliday: true, classIds: null, venue: null });
      break;
    }
    case "MEETING": {
      if (row.endDate !== row.startDate) throw unprocessable("A meeting is on one day");
      if (!hasTimes) throw unprocessable("Give the meeting's start and end time");
      if (classIds && STAFF_MEETING_CATEGORIES.includes(row.category)) {
        throw unprocessable("A staff or management meeting is for staff: it has no classes");
      }
      Object.assign(row, { isHoliday: false, classIds });
      break;
    }
    case "EXAM":
      Object.assign(row, { isHoliday: false, startTime: null, endTime: null, classIds: null });
      break;
    default:
      Object.assign(row, { isHoliday: row.isHoliday ?? NON_WORKING_EVENT_TYPES.includes(eventType), classIds });
  }

  if (classIds && !(await classService.allExist(ctx, classIds))) throw unprocessable("classIds refers to a class that does not exist");
  assertInYear(academicYear, row);
  row.startTime = toTime(row.startTime) ?? null;
  row.endTime = toTime(row.endTime) ?? null;
  if (row.isHoliday) await assertNoPapers(ctx, academicYear.id, row);
  return row;
};

/* EXAM: the exam's papers on school days of the year; returns the first and last day */
const checkTimetable = async (ctx, academicYear, timetable) => {
  const dates = [...new Set(timetable.map(r => r.examDate))].sort();
  const from = dates[0];
  const to = dates.at(-1);
  if (from < academicYear.startDate || to > academicYear.endDate) {
    throw unprocessable(`Exam papers must be sat within the academic year (${academicYear.startDate} to ${academicYear.endDate})`);
  }
  const { closedDays } = await calendarService.workingDays(ctx, academicYear, from, to);
  const closed = closedDays.find(c => dates.includes(c.date));
  if (closed) {
    const why = closed.reason === "WEEKLY_OFF" ? "a weekly off day" : `closed (${closed.title ?? closed.reason.toLowerCase()})`;
    throw unprocessable(`${closed.date} is ${why}: no exam paper can be sat that day`);
  }
  return { startDate: from, endDate: to };
};

const loadExam = async (ctx, academicYear, examId) => {
  const exam = await examService.findById(ctx, examId);
  if (!exam || exam.academicYearId !== academicYear.id) throw unprocessable("examId does not refer to an exam of this academic year");
  return exam;
};

/* The exam's own dates follow its timetable */
const syncExamDates = async (ctx, exam, window) => {
  if (exam.startDate !== window.startDate || exam.endDate !== window.endDate) await examService.update(ctx, exam.id, window);
};

export const calendarService = {
  getById: base.getById,
  remove: base.remove,

  /* Year-scoped; optional date window and type */
  list: (ctx, { page, limit, from, to, eventType }) =>
    base.list(
      ctx,
      { page, limit },
      [
        eq(calendarEvents.academicYearId, ctx.academicYearId),
        (from || to) && overlapping(from ?? "0001-01-01", to ?? "9999-12-31"),
        eventType && eq(calendarEvents.eventType, eventType)
      ].filter(Boolean)
    ),

  create: async (ctx, { timetable, ...data }) => {
    const year = ctx.academicYear;
    if (data.eventType !== "EXAM") {
      if (timetable || data.examId) throw unprocessable("Only an exam event has an exam and a timetable");
      if (!data.startDate) throw unprocessable("startDate is required");
      const row = await shape(ctx, year, data);
      return calendarEventRepository.create(ctx.tenantId, { ...row, academicYearId: year.id });
    }

    /* EXAM: the exam, once on the calendar, with every paper scheduled */
    if (!data.examId) throw unprocessable("Pick the exam");
    if (!timetable) throw unprocessable("Give the exam's timetable: a date and time for every paper");
    const exam = await loadExam(ctx, year, data.examId);
    if (await calendarEventRepository.exists(ctx.tenantId, [eq(calendarEvents.examId, exam.id)])) {
      throw conflict(`${exam.examName} is already on the calendar. Change its timetable there.`);
    }
    const window = await checkTimetable(ctx, year, timetable);
    const row = await shape(ctx, year, { ...data, ...window, title: exam.examName });
    const created = await transaction(async dbc => {
      await examPaperService.setSchedule(ctx, exam.id, timetable, { dbc });
      return calendarEventRepository.create(ctx.tenantId, { ...row, academicYearId: year.id }, { dbc });
    });
  },

  update: async (ctx, eventId, { timetable, ...data }) => {
    const existing = await calendarEventRepository.findById(ctx.tenantId, eventId);
    if (!existing) throw notFound("Calendar event");
    const year = await academicYearService.findById(ctx, existing.academicYearId);
    const merged = { ...existing, ...data };

    if (existing.eventType !== "EXAM") {
      if (timetable) throw unprocessable("Only an exam event has a timetable");
      if (merged.endDate < merged.startDate) throw unprocessable("endDate must be on or after startDate");
      return base.update(ctx, eventId, editable(await shape(ctx, year, merged)));
    }

    /* EXAM: its dates and title follow the exam; a new timetable reschedules the papers */
    if (data.startDate || data.endDate) throw unprocessable("An exam's dates come from its timetable: change the papers' dates instead");
    const exam = await loadExam(ctx, year, existing.examId);
    const window = timetable ? await checkTimetable(ctx, year, timetable) : {};
    const row = editable(await shape(ctx, year, { ...merged, ...window, title: exam.examName }));
    if (!timetable) return base.update(ctx, eventId, row);
    const updated = await transaction(async dbc => {
      await examPaperService.setSchedule(ctx, exam.id, timetable, { dbc });
      return calendarEventRepository.update(ctx.tenantId, eventId, row, { dbc });
    });
    await syncExamDates(ctx, exam, window);
    return updated;
  },

  /* The exam's papers moved, or the exam was removed (EXAM_SCHEDULE_CHANGED): its event
     spans the first to the last scheduled paper, or goes with the exam */
  syncExam: async (ctx, examId) => {
    const event = await calendarEventRepository.findOne(ctx.tenantId, [eq(calendarEvents.examId, examId)]);
    if (!event) return;
    const exam = await examService.findById(ctx, examId);
    if (!exam) return calendarEventRepository.softDelete(ctx.tenantId, event.id);
    const dates = (await examPaperService.findForExam(ctx, examId)).map(p => p.examDate).filter(Boolean).sort();
    if (!dates.length) return;
    const window = { startDate: dates[0], endDate: dates.at(-1) };
    await syncExamDates(ctx, exam, window);
    return calendarEventRepository.update(ctx.tenantId, event.id, { ...window, title: exam.examName });
  },

  /* For other submodules: the exam's calendar event (its timetable), or null */
  findForExam: (ctx, examId) => calendarEventRepository.findOne(ctx.tenantId, [eq(calendarEvents.examId, examId)]),

  /* For other submodules.
     Every school day in [from, to] (clamped to the academic year): not a weekly
     off day or off Saturday, and not covered by a holiday/vacation event. */
  workingDays: async (ctx, academicYear, from, to) => {
    const start = maxDate(from, academicYear.startDate);
    const end = minDate(to, academicYear.endDate);
    if (start > end) return { from: start, to: end, workingDays: [], closedDays: [] };

    const closures = await calendarEventRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(calendarEvents.academicYearId, academicYear.id),
        eq(calendarEvents.isHoliday, true),
        overlapping(start, end)
      ]
    });

    const workingDays = [];
    const closedDays = [];
    for (const day of eachDay(start, end)) {
      const closure = closures.find(event => event.startDate <= day && event.endDate >= day);
      if (isWeeklyOff(academicYear, day)) closedDays.push({ date: day, reason: "WEEKLY_OFF" });
      else if (closure) closedDays.push({ date: day, reason: closure.eventType, title: closure.title });
      else workingDays.push(day);
    }
    return { from: start, to: end, workingDays, closedDays };
  },

  /* Why the school is closed on `date`, or null when it is a working day */
  closureOn: async (ctx, academicYear, date) => {
    if (date < academicYear.startDate || date > academicYear.endDate) return "OUTSIDE_ACADEMIC_YEAR";
    const { closedDays } = await calendarService.workingDays(ctx, academicYear, date, date);
    return closedDays[0]?.reason ?? null;
  }
};

/* The stored fields an update writes (all of them: the type rules may reset ones not sent,
   e.g. a holiday's isHoliday); an emptied venue is cleared */
const EDITABLE = ["title", "category", "startDate", "endDate", "isHoliday", "startTime", "endTime", "venue", "classIds", "description"];
function editable(row) {
  const out = Object.fromEntries(EDITABLE.map(key => [key, row[key] ?? null]));
  if (out.venue === "") out.venue = null;
  return out;
}
