import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository } from "../../../../common/database/repository.js";
import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { assessments } from "../../assessments/models/assessment.schema.js";
import { classSubjects } from "../../class-subjects/models/classSubject.schema.js";
import { examPapers } from "../../exams/models/examPaper.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { classCodeSlots } from "../models/classCodeSlot.schema.js";

describeDuplicates({
  class_code_slots_place_uq: ({ stage, position }) => `Another class already has place ${stage}-${position}`,
  class_subjects_code_uq: ({ code }) => `Another subject of the year already has the code ${code}`
});

const base = createRepository({ table: classCodeSlots, queryKey: "classCodeSlots" });

/* Exam papers and assessments of the class subjects' sections: [{ classId, academicYearId, subjectId }] */
const papersAndAssessments = async (tenantId, conditions, dbc) => {
  const uses = table =>
    dbc
      .selectDistinct({ classId: sections.classId, academicYearId: table.academicYearId, subjectId: table.subjectId })
      .from(table)
      .innerJoin(sections, eq(sections.id, table.sectionId))
      .where(and(eq(table.tenantId, tenantId), eq(table.isActive, true), ...conditions(table)));
  return (await Promise.all([uses(examPapers), uses(assessments)])).flat();
};

export const classCodeSlotRepository = {
  ...base,

  /* Hard delete: a place is a setting, not a record */
  removeForClasses: (tenantId, classIds, { dbc = db } = {}) =>
    dbc.delete(classCodeSlots).where(and(eq(classCodeSlots.tenantId, tenantId), inArray(classCodeSlots.classId, classIds))),

  /* Active class subjects matching -> rows with their subject's code and whether their year is archived */
  classSubjects: (tenantId, conditions, { dbc = db } = {}) =>
    dbc
      .select({
        id: classSubjects.id,
        academicYearId: classSubjects.academicYearId,
        classId: classSubjects.classId,
        subjectId: classSubjects.subjectId,
        isOptional: classSubjects.isOptional,
        code: classSubjects.code,
        archived: isNotNull(academicYears.archivedAt)
      })
      .from(classSubjects)
      .innerJoin(academicYears, eq(academicYears.id, classSubjects.academicYearId))
      .where(and(eq(classSubjects.tenantId, tenantId), eq(classSubjects.isActive, true), ...conditions)),

  /* Which of the class subjects have exam papers or assessments -> Set of "classId:yearId:subjectId" */
  usedKeys: async (tenantId, rows, { dbc = db } = {}) => {
    if (!rows.length) return new Set();
    const classIds = [...new Set(rows.map(r => r.classId))];
    const subjectIds = [...new Set(rows.map(r => r.subjectId))];
    const found = await papersAndAssessments(
      tenantId,
      table => [inArray(sections.classId, classIds), inArray(table.subjectId, subjectIds)],
      dbc
    );
    return new Set(found.map(u => `${u.classId}:${u.academicYearId}:${u.subjectId}`));
  },

  /* Classes with exam papers or assessments in any year */
  usedClassIds: async (tenantId, { dbc = db } = {}) =>
    new Set((await papersAndAssessments(tenantId, () => [], dbc)).map(u => u.classId)),

  /* Classes with a subject in an archived year: their codes are history */
  archivedClassIds: async (tenantId, { dbc = db } = {}) =>
    new Set(
      (
        await dbc
          .selectDistinct({ classId: classSubjects.classId })
          .from(classSubjects)
          .innerJoin(academicYears, eq(academicYears.id, classSubjects.academicYearId))
          .where(and(eq(classSubjects.tenantId, tenantId), eq(classSubjects.isActive, true), isNotNull(academicYears.archivedAt)))
      ).map(r => r.classId)
    ),

  /* New codes for class subjects and the section subjects of their class that year. Two steps,
     so codes can swap between rows (two classes trading places) without hitting the unique index. */
  recode: async (tenantId, changes, { dbc = db } = {}) => {
    if (!changes.length) return;
    const ids = changes.map(c => c.id);
    await dbc
      .update(classSubjects)
      .set({ code: sql`${classSubjects.code} || '~' || ${classSubjects.id}` })
      .where(and(eq(classSubjects.tenantId, tenantId), inArray(classSubjects.id, ids)));
    for (const { id, code } of changes) {
      const [row] = await dbc
        .update(classSubjects)
        .set({ code })
        .where(eq(classSubjects.id, id))
        .returning({ academicYearId: classSubjects.academicYearId, classId: classSubjects.classId, subjectId: classSubjects.subjectId });
      await dbc.execute(sql`
        UPDATE section_subjects ss SET display_code = ${code} || '-' || s.section_name, updated_at = now()
        FROM sections s
        WHERE s.id = ss.section_id AND s.class_id = ${row.classId} AND ss.tenant_id = ${tenantId}
          AND ss.academic_year_id = ${row.academicYearId} AND ss.subject_id = ${row.subjectId} AND ss.is_active = true`);
    }
  }
};
