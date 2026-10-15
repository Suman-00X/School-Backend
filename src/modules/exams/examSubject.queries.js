import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { examSubjects } from "../../database/postgres/schema/index.js";
import { findOne, scoped } from "../../database/postgres/helpers.js";

export const createExamSubject = async (tenantId, academicYearId, payload) => {
  const [row] = await db
    .insert(examSubjects)
    .values({ ...payload, tenantId, academicYearId })
    .returning();
  return row;
};

export const getExamStructure = (tenantId, examId) =>
  db.query.examSubjects.findMany({
    where: scoped(examSubjects, tenantId, eq(examSubjects.examId, examId)),
    with: {
      section: { columns: { id: true, sectionName: true } },
      subject: { columns: { id: true, subjectName: true, subjectCode: true } }
    }
  });

export const getExamSubjectById = (tenantId, examSubjectId) =>
  findOne(db, examSubjects, scoped(examSubjects, tenantId, eq(examSubjects.id, examSubjectId)));
