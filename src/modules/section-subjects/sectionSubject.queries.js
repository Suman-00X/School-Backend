import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { sectionSubjects } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";

export const createSectionSubject = async (tenantId, academicYearId, payload) => {
  const [row] = await db
    .insert(sectionSubjects)
    .values({ ...payload, tenantId, academicYearId })
    .returning();
  return row;
};

export const getSubjectsBySection = (tenantId, academicYearId, sectionId) =>
  db.query.sectionSubjects.findMany({
    where: scoped(
      sectionSubjects,
      tenantId,
      eq(sectionSubjects.academicYearId, academicYearId),
      eq(sectionSubjects.sectionId, sectionId)
    ),
    with: { subject: { columns: { id: true, subjectName: true, subjectCode: true } } }
  });

export const isSubjectMappedToSection = (tenantId, academicYearId, sectionId, subjectId) =>
  exists(
    db,
    sectionSubjects,
    scoped(
      sectionSubjects,
      tenantId,
      eq(sectionSubjects.academicYearId, academicYearId),
      eq(sectionSubjects.sectionId, sectionId),
      eq(sectionSubjects.subjectId, subjectId)
    )
  );

/* Soft remove */
export const removeSectionSubject = (tenantId, mapId) =>
  updateOne(db, sectionSubjects, scoped(sectionSubjects, tenantId, eq(sectionSubjects.id, mapId)), {
    isActive: false
  });
