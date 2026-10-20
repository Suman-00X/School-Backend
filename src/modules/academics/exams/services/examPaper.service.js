import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { publish } from "../../../../common/events/events.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
/* Cycle with calendar (it schedules exams): only used inside functions */
import { calendarService } from "../../calendar/index.js";
import { marksService } from "../../marks/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectService } from "../../subjects/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { examPaperCode } from "../../shared/utils/codes.util.js";
import { examPapers } from "../models/examPaper.schema.js";
import { examPaperRepository } from "../repositories/examPaper.repository.js";
import { EXAM_SCHEDULE_CHANGED, examService } from "./exam.service.js";

const withDetails = {
  section: { columns: { id: true, sectionName: true } },
  subject: { columns: { id: true, subjectName: true, subjectCode: true } }
};

/* "09:00" -> "09:00:00" (stored form, compares as a string) */
const toTime = value => (value && value.length === 5 ? `${value}:00` : value);

/* A section cannot sit two papers at overlapping times on the same day */
const assertNoScheduleClash = async (ctx, { sectionId, examDate, startTime, endTime }, exceptId) => {
  if (!examDate || !startTime || !endTime) return;
  const sameDay = await examPaperRepository.findMany(ctx.tenantId, {
    conditions: [
      eq(examPapers.sectionId, sectionId),
      eq(examPapers.examDate, examDate),
      exceptId && ne(examPapers.id, exceptId)
    ].filter(Boolean),
    with: withDetails
  });
  const clash = sameDay.find(p => p.startTime && p.endTime && startTime < p.endTime && endTime > p.startTime);
  if (clash) {
    throw conflict(
      `The section already sits ${clash.subject.subjectName} (${clash.displayCode}) on ${examDate} from ${clash.startTime.slice(0, 5)} to ${clash.endTime.slice(0, 5)}`
    );
  }
};

const scheduleChanged = (ctx, examId) => publish(EXAM_SCHEDULE_CHANGED, { tenantId: ctx.tenantId, examId });

const CLOSED = { WEEKLY_OFF: "a weekly off day", HOLIDAY: "a holiday", VACATION: "in a vacation", OUTSIDE_ACADEMIC_YEAR: "outside the academic year" };

/* A paper is sat on a school day of its exam's year */
const assertSchoolDay = async (ctx, academicYearId, examDate) => {
  if (!examDate) return;
  const year = await academicYearService.findById(ctx, academicYearId);
  const closure = await calendarService.closureOn(ctx, year, examDate);
  if (closure) throw unprocessable(`${examDate} is ${CLOSED[closure] ?? "a day the school is closed"}: no exam paper can be sat that day`);
};

const overlaps = (a, b) => a.startTime < b.endTime && a.endTime > b.startTime;

const loadPaper = async (ctx, examId, paperId) => {
  const paper = await examPaperRepository.findById(ctx.tenantId, paperId);
  if (!paper || paper.examId !== examId) throw notFound("Exam paper");
  return paper;
};

export const examPaperService = {
  /* Papers of an exam, optionally of one section. Teachers: their sections only (D-11). */
  list: async (ctx, examId, { page, limit, sectionId }) => {
    await examService.getById(ctx, examId);
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    const visible = sectionId ? null : await teachingScope.sectionIds(ctx);
    return examPaperRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        eq(examPapers.examId, examId),
        sectionId && eq(examPapers.sectionId, sectionId),
        visible && (visible.length ? inArray(examPapers.sectionId, visible) : sql`false`)
      ].filter(Boolean),
      with: withDetails
    });
  },

  /* A paper lives in its exam's academic year */
  create: async (
    ctx,
    examId,
    {
      sectionId,
      subjectId,
      gradingType = "MARKS",
      component,
      examDate,
      startTime,
      endTime,
      room,
      maxMarks,
      passMarks,
      description
    }
  ) => {
    const exam = await examService.getById(ctx, examId);
    await sectionService.getPlacement(ctx, exam.academicYearId, sectionId);

    const taught = await sectionSubjectService.findTaught(ctx, exam.academicYearId, sectionId, subjectId);
    if (!taught) throw unprocessable("This subject is not taught in the section. Add it to the section first.");
    const subject = await subjectService.findById(ctx, subjectId);

    /* A subject has one whole paper, or one paper per component, all graded the same way */
    const siblings = await examPaperRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(examPapers.examId, examId),
        eq(examPapers.sectionId, sectionId),
        eq(examPapers.subjectId, subjectId)
      ]
    });
    if (siblings.some(p => !p.component || !component || p.component === component)) {
      throw conflict(
        component && siblings.some(p => p.component === component)
          ? `This exam already has a ${component.toLowerCase()} paper for ${subject.subjectName} in the section`
          : "This exam already has a paper for the subject in the section"
      );
    }
    if (siblings.some(p => p.gradingType !== gradingType)) {
      throw unprocessable(
        `${subject.subjectName}'s other components are ${siblings[0].gradingType === "GRADE" ? "graded without marks" : "marked out of marks"}; every component must be graded the same way`
      );
    }

    const schedule = { sectionId, examDate, startTime: toTime(startTime), endTime: toTime(endTime) };
    await assertSchoolDay(ctx, exam.academicYearId, examDate);
    await assertNoScheduleClash(ctx, schedule);

    const paper = await examPaperRepository.create(ctx.tenantId, {
      academicYearId: exam.academicYearId,
      examId,
      sectionId,
      subjectId,
      component,
      gradingType,
      displayCode: examPaperCode({ sectionSubjectCode: taught.displayCode, examType: exam.examType, component }),
      ...schedule,
      room,
      maxMarks,
      passMarks,
      description
    });
    await scheduleChanged(ctx, examId);
    return paper;
  },

  /* Reschedule or change marks. Max marks cannot drop below marks already recorded. */
  update: async (ctx, examId, paperId, data) => {
    const paper = await loadPaper(ctx, examId, paperId);
    const merged = {
      ...paper,
      ...data,
      startTime: toTime(data.startTime) ?? paper.startTime,
      endTime: toTime(data.endTime) ?? paper.endTime
    };
    if (merged.startTime && merged.endTime && merged.endTime <= merged.startTime) {
      throw unprocessable("endTime must be after startTime");
    }
    if (paper.gradingType === "GRADE" && (data.maxMarks !== undefined || data.passMarks !== undefined)) {
      throw unprocessable("This paper is graded without marks, so it has no max or pass marks");
    }
    if (merged.passMarks !== null && merged.passMarks !== undefined && merged.passMarks > merged.maxMarks) {
      throw unprocessable("passMarks cannot exceed maxMarks");
    }
    if (data.maxMarks !== undefined) {
      const highest = await marksService.highestForPaper(ctx, paperId);
      if (highest !== null && highest > data.maxMarks) {
        throw unprocessable(`maxMarks cannot be below the highest recorded mark (${highest})`);
      }
    }
    if (data.examDate) await assertSchoolDay(ctx, paper.academicYearId, data.examDate);
    await assertNoScheduleClash(ctx, merged, paperId);

    const updated = await examPaperRepository.update(ctx.tenantId, paperId, {
      ...data,
      ...(data.startTime && { startTime: merged.startTime }),
      ...(data.endTime && { endTime: merged.endTime })
    });
    if (["examDate", "startTime", "endTime", "room"].some(key => data[key] !== undefined)) await scheduleChanged(ctx, examId);
    return updated;
  },

  remove: async (ctx, examId, paperId) => {
    await loadPaper(ctx, examId, paperId);
    if (await marksService.hasMarksForPaper(ctx, paperId)) {
      throw conflict("This paper already has recorded marks and cannot be removed");
    }
    const removed = await examPaperRepository.softDelete(ctx.tenantId, paperId);
    await scheduleChanged(ctx, examId);
    return removed;
  },

  /* The exam's whole timetable at once (the calendar's exam event): every paper of the exam
     once, [{ paperId, examDate, startTime, endTime, room? }]. A section sits one paper at a
     time, in this exam and with other exams' papers. Returns the papers as saved. */
  setSchedule: async (ctx, examId, rows, { dbc } = {}) => {
    const papers = await examPaperService.findForExam(ctx, examId);
    if (!papers.length) throw unprocessable("This exam has no papers yet. Add its papers on the exam's page first.");
    const byId = new Map(papers.map(p => [p.id, p]));
    const seen = new Set();
    for (const row of rows) {
      if (!byId.has(row.paperId)) throw unprocessable("The timetable lists a paper that is not part of this exam");
      if (seen.has(row.paperId)) throw unprocessable("The timetable lists a paper twice");
      seen.add(row.paperId);
    }
    const missing = papers.filter(p => !seen.has(p.id));
    if (missing.length) {
      const names = missing.slice(0, 3).map(p => `${p.subject.subjectName} (${p.section.sectionName})`);
      throw unprocessable(`Every paper needs a date and time: ${names.join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`);
    }

    const slots = rows.map(row => ({ ...row, startTime: toTime(row.startTime), endTime: toTime(row.endTime), paper: byId.get(row.paperId) }));
    for (const slot of slots) if (slot.endTime <= slot.startTime) throw unprocessable(`${slot.paper.subject.subjectName}: the end time must be after the start`);

    /* Within the exam */
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        if (a.paper.sectionId === b.paper.sectionId && a.examDate === b.examDate && overlaps(a, b)) {
          throw conflict(`Section ${a.paper.section.sectionName} would sit ${a.paper.subject.subjectName} and ${b.paper.subject.subjectName} at the same time on ${a.examDate}`);
        }
      }
    }
    /* With other exams' papers on those days */
    const others = await examPaperRepository.findMany(ctx.tenantId, {
      conditions: [
        ne(examPapers.examId, examId),
        inArray(examPapers.sectionId, [...new Set(slots.map(s => s.paper.sectionId))]),
        inArray(examPapers.examDate, [...new Set(slots.map(s => s.examDate))])
      ],
      with: withDetails,
      dbc
    });
    for (const slot of slots) {
      const clash = others.find(o => o.sectionId === slot.paper.sectionId && o.examDate === slot.examDate && o.startTime && o.endTime && overlaps(slot, o));
      if (clash) {
        throw conflict(
          `Section ${slot.paper.section.sectionName} already sits ${clash.subject.subjectName} (${clash.displayCode}) of another exam on ${slot.examDate} from ${clash.startTime.slice(0, 5)} to ${clash.endTime.slice(0, 5)}`
        );
      }
    }

    const saved = [];
    for (const slot of slots) {
      saved.push(
        await examPaperRepository.update(
          ctx.tenantId,
          slot.paperId,
          { examDate: slot.examDate, startTime: slot.startTime, endTime: slot.endTime, ...(slot.room ? { room: slot.room } : {}) },
          { dbc, conditions: [eq(examPapers.examId, examId)] }
        )
      );
    }
    return saved;
  },

  /* For other submodules */
  findById: (ctx, paperId) => examPaperRepository.findById(ctx.tenantId, paperId),

  /* Papers of the year sat between from and to (inclusive), e.g. under a new holiday */
  findScheduledBetween: (ctx, academicYearId, from, to) =>
    examPaperRepository.findMany(ctx.tenantId, {
      conditions: [eq(examPapers.academicYearId, academicYearId), and(gte(examPapers.examDate, from), lte(examPapers.examDate, to))],
      with: withDetails
    }),

  findForExam: (ctx, examId, { sectionId } = {}) =>
    examPaperRepository.findMany(ctx.tenantId, {
      conditions: [eq(examPapers.examId, examId), sectionId && eq(examPapers.sectionId, sectionId)].filter(Boolean),
      with: withDetails
    })
};
