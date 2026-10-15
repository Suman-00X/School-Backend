import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { examPapers } from "../../exams/models/examPaper.schema.js";
import { gradingService } from "../../grading/index.js";
import { teachingScope } from "../../shared/services/teachingScope.service.js";
import { marks } from "../models/marks.schema.js";
import { marksRepository } from "../repositories/marks.repository.js";

const withPaper = {
  examPaper: {
    columns: { id: true, displayCode: true, maxMarks: true, passMarks: true },
    with: {
      exam: { columns: { id: true, examName: true, examType: true } },
      subject: { columns: { id: true, subjectName: true, subjectCode: true } }
    }
  }
};

/* Per-request memo of papers and grade scales (bulk entry hits the same ones) */
const loader = ctx => {
  const papers = new Map();
  const scales = new Map();
  return {
    paper: async id => {
      if (!papers.has(id)) papers.set(id, await examPaperService.findById(ctx, id));
      return papers.get(id);
    },
    scaleForExam: async examId => {
      if (!scales.has(examId)) {
        const exam = await examService.findById(ctx, examId);
        scales.set(examId, await gradingService.resolveScale(ctx, exam?.gradeScaleId));
      }
      return scales.get(examId);
    }
  };
};

/* Check one entry against its paper and build the row to save */
const buildRow = async (ctx, entry, evaluatedBy, load) => {
  const paper = await load.paper(entry.examPaperId);
  if (!paper) throw unprocessable("examPaperId does not refer to an existing exam paper");

  await teachingScope.assertSection(ctx, paper.sectionId, { subjectId: paper.subjectId });

  const enrolled = await enrollmentService.isStudentInSection(
    ctx,
    entry.studentId,
    paper.sectionId,
    paper.academicYearId
  );
  if (!enrolled) throw unprocessable("The student is not enrolled in this paper's section");

  if (!entry.isAbsent && entry.marksObtained > paper.maxMarks) {
    throw unprocessable(`marksObtained cannot exceed the paper's maximum of ${paper.maxMarks}`);
  }

  /* An explicit grade wins; otherwise grade from the exam's scale */
  let grade = entry.grade ?? null;
  if (!grade && !entry.isAbsent) {
    const scale = await load.scaleForExam(paper.examId);
    grade = gradingService.gradeFor(scale, (entry.marksObtained / paper.maxMarks) * 100)?.grade ?? null;
  }

  return {
    academicYearId: paper.academicYearId,
    studentId: entry.studentId,
    examPaperId: entry.examPaperId,
    marksObtained: entry.isAbsent ? null : entry.marksObtained,
    isAbsent: entry.isAbsent,
    grade,
    remarks: entry.remarks ?? null,
    evaluatedBy: evaluatedBy ?? null,
    evaluatedAt: new Date()
  };
};

/* Teacher profile of the signed-in user (admins and principals have none) */
const evaluatorOf = async ctx => (await teacherService.findByUserId(ctx, ctx.userId))?.id;

export const marksService = {
  /* -> { marks, created } */
  record: async (ctx, entry) => {
    const row = await buildRow(ctx, entry, await evaluatorOf(ctx), loader(ctx));
    const [{ id, created }] = await marksRepository.upsert(ctx.tenantId, [row]);
    return { marks: await marksRepository.findById(ctx.tenantId, id, { with: withPaper }), created };
  },

  /* -> { created, updated } */
  recordMany: async (ctx, entries) => {
    const evaluatedBy = await evaluatorOf(ctx);
    const load = loader(ctx);
    const rows = [];
    for (const [index, entry] of entries.entries()) {
      try {
        rows.push(await buildRow(ctx, entry, evaluatedBy, load));
      } catch (error) {
        if (error.status) error.message = `marks[${index}]: ${error.message}`;
        throw error;
      }
    }

    const result = await marksRepository.upsert(ctx.tenantId, rows);
    const created = result.filter(row => row.created).length;
    return { created, updated: result.length - created };
  },

  /* Year-scoped: one student's marks, optionally for one exam */
  list: async (ctx, { page, limit, studentId, examId }) => {
    if (ctx.role === "TEACHER") {
      const enrollment = await enrollmentService.findForStudent(ctx, studentId, ctx.academicYearId);
      if (enrollment) await teachingScope.assertSection(ctx, enrollment.sectionId);
    }
    return marksRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withPaper,
      conditions: [
        eq(marks.academicYearId, ctx.academicYearId),
        eq(marks.studentId, studentId),
        examId &&
          inArray(
            marks.examPaperId,
            db.select({ id: examPapers.id }).from(examPapers).where(eq(examPapers.examId, examId))
          )
      ].filter(Boolean)
    });
  },

  /* For other submodules */

  /* Every mark recorded for a set of papers */
  findForPapers: (ctx, paperIds) =>
    paperIds.length
      ? marksRepository.findMany(ctx.tenantId, { conditions: [inArray(marks.examPaperId, paperIds)] })
      : [],

  hasMarksForPaper: (ctx, paperId) => marksRepository.exists(ctx.tenantId, [eq(marks.examPaperId, paperId)]),

  highestForPaper: async (ctx, paperId) => {
    const [row] = await db
      .select({ highest: max(marks.marksObtained) })
      .from(marks)
      .where(and(eq(marks.tenantId, ctx.tenantId), eq(marks.isActive, true), eq(marks.examPaperId, paperId)));
    return row?.highest === null || row?.highest === undefined ? null : Number(row.highest);
  }
};
