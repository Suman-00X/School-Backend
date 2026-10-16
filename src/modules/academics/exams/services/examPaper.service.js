import { eq, ne } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { marksService } from "../../marks/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectService } from "../../subjects/index.js";
import { examPaperCode } from "../../shared/utils/codes.util.js";
import { examPapers } from "../models/examPaper.schema.js";
import { examPaperRepository } from "../repositories/examPaper.repository.js";
import { examService } from "./exam.service.js";

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

const loadPaper = async (ctx, examId, paperId) => {
  const paper = await examPaperRepository.findById(ctx.tenantId, paperId);
  if (!paper || paper.examId !== examId) throw notFound("Exam paper");
  return paper;
};

export const examPaperService = {
  /* Papers of an exam, optionally of one section */
  list: async (ctx, examId, { page, limit, sectionId }) => {
    await examService.getById(ctx, examId);
    return examPaperRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [eq(examPapers.examId, examId), sectionId && eq(examPapers.sectionId, sectionId)].filter(Boolean),
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
    const placement = await sectionService.getPlacement(ctx, exam.academicYearId, sectionId);

    if (!(await sectionSubjectService.isTaught(ctx, exam.academicYearId, sectionId, subjectId))) {
      throw unprocessable("This subject is not taught in the section. Add it to the section first.");
    }
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
    await assertNoScheduleClash(ctx, schedule);

    return examPaperRepository.create(ctx.tenantId, {
      academicYearId: exam.academicYearId,
      examId,
      sectionId,
      subjectId,
      component,
      gradingType,
      displayCode: examPaperCode({
        subjectCode: subject.subjectCode,
        examType: exam.examType,
        component,
        ...placement
      }),
      ...schedule,
      room,
      maxMarks,
      passMarks,
      description
    });
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
    await assertNoScheduleClash(ctx, merged, paperId);

    return examPaperRepository.update(ctx.tenantId, paperId, {
      ...data,
      ...(data.startTime && { startTime: merged.startTime }),
      ...(data.endTime && { endTime: merged.endTime })
    });
  },

  remove: async (ctx, examId, paperId) => {
    await loadPaper(ctx, examId, paperId);
    if (await marksService.hasMarksForPaper(ctx, paperId)) {
      throw conflict("This paper already has recorded marks and cannot be removed");
    }
    return examPaperRepository.softDelete(ctx.tenantId, paperId);
  },

  /* For other submodules */
  findById: (ctx, paperId) => examPaperRepository.findById(ctx.tenantId, paperId),

  findForExam: (ctx, examId, { sectionId } = {}) =>
    examPaperRepository.findMany(ctx.tenantId, {
      conditions: [eq(examPapers.examId, examId), sectionId && eq(examPapers.sectionId, sectionId)].filter(Boolean),
      with: withDetails
    })
};
