import { eq, sql } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { marks } from "../../database/postgres/schema/index.js";
import { scoped } from "../../database/postgres/helpers.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);

/* Insert or update marks rows on (student_id, exam_subject_id) in one statement.
   `created` is true for new rows (Postgres sets xmax = 0 on insert). */
export const upsertMarks = (tenantId, entries, dbc = db) =>
  dbc
    .insert(marks)
    .values(entries.map(entry => ({ ...entry, tenantId, isActive: true })))
    .onConflictDoUpdate({
      target: [marks.studentId, marks.examSubjectId],
      set: {
        marksObtained: excluded(marks.marksObtained),
        isAbsent: excluded(marks.isAbsent),
        grade: excluded(marks.grade),
        remarks: excluded(marks.remarks),
        evaluatedBy: excluded(marks.evaluatedBy),
        evaluatedAt: excluded(marks.evaluatedAt),
        isActive: true,
        updatedAt: new Date()
      }
    })
    .returning({ id: marks.id, created: sql`(xmax = 0)`.mapWith(Boolean) });

export const getMarksById = async (tenantId, marksId) =>
  (await db.query.marks.findFirst({ where: scoped(marks, tenantId, eq(marks.id, marksId)) })) ?? null;

export const getMarksByStudent = (tenantId, academicYearId, studentId) =>
  db.query.marks.findMany({
    where: scoped(marks, tenantId, eq(marks.academicYearId, academicYearId), eq(marks.studentId, studentId)),
    with: {
      examSubject: {
        columns: { id: true, displayCode: true, maxMarks: true, passMarks: true },
        with: {
          exam: { columns: { id: true, examName: true, examType: true } },
          subject: { columns: { id: true, subjectName: true, subjectCode: true } }
        }
      }
    }
  });
