import { eq, inArray } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService } from "../../exams/index.js";
import { examPapers } from "../../exams/models/examPaper.schema.js";
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

/* Check one entry against its paper and build the row to save */
const buildRow = async (ctx, entry, evaluatedBy) => {
  const paper = await examPaperService.findById(ctx, entry.examPaperId);
  if (!paper) throw unprocessable("examPaperId does not refer to an existing exam paper");

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

  return {
    academicYearId: paper.academicYearId,
    studentId: entry.studentId,
    examPaperId: entry.examPaperId,
    marksObtained: entry.isAbsent ? null : entry.marksObtained,
    isAbsent: entry.isAbsent,
    grade: entry.grade ?? null,
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
    const row = await buildRow(ctx, entry, await evaluatorOf(ctx));
    const [{ id, created }] = await marksRepository.upsert(ctx.tenantId, [row]);
    return { marks: await marksRepository.findById(ctx.tenantId, id, { with: withPaper }), created };
  },

  /* -> { created, updated } */
  recordMany: async (ctx, entries) => {
    const evaluatedBy = await evaluatorOf(ctx);
    const rows = [];
    for (const [index, entry] of entries.entries()) {
      try {
        rows.push(await buildRow(ctx, entry, evaluatedBy));
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
  list: (ctx, { page, limit, studentId, examId }) =>
    marksRepository.list(ctx.tenantId, {
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
    })
};
