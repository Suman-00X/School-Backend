import { eq } from "drizzle-orm";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
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
  create: async (ctx, examId, { sectionId, subjectId, examDate, maxMarks, passMarks, description }) => {
    const exam = await examService.getById(ctx, examId);
    const placement = await sectionService.getPlacement(ctx, exam.academicYearId, sectionId);

    if (!(await sectionSubjectService.isTaught(ctx, exam.academicYearId, sectionId, subjectId))) {
      throw unprocessable("This subject is not taught in the section. Add it to the section first.");
    }
    const subject = await subjectService.findById(ctx, subjectId);

    const duplicate = await examPaperRepository.exists(ctx.tenantId, [
      eq(examPapers.examId, examId),
      eq(examPapers.sectionId, sectionId),
      eq(examPapers.subjectId, subjectId)
    ]);
    if (duplicate) throw conflict("This exam already has a paper for the subject in the section");

    return examPaperRepository.create(ctx.tenantId, {
      academicYearId: exam.academicYearId,
      examId,
      sectionId,
      subjectId,
      displayCode: examPaperCode({ subjectCode: subject.subjectCode, examType: exam.examType, ...placement }),
      examDate,
      maxMarks,
      passMarks,
      description
    });
  },

  /* For other submodules: null when missing */
  findById: (ctx, paperId) => examPaperRepository.findById(ctx.tenantId, paperId)
};
