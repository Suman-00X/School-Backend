import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { teacherAssignments } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";

export const createTeacherAssignment = async (tenantId, academicYearId, payload) => {
  const [row] = await db
    .insert(teacherAssignments)
    .values({ ...payload, tenantId, academicYearId })
    .returning();
  return row;
};

export const getTeachersBySection = (tenantId, academicYearId, sectionId) =>
  db.query.teacherAssignments.findMany({
    where: scoped(
      teacherAssignments,
      tenantId,
      eq(teacherAssignments.academicYearId, academicYearId),
      eq(teacherAssignments.sectionId, sectionId)
    ),
    with: {
      teacher: {
        columns: { id: true, employeeCode: true },
        with: { user: { columns: { firstName: true, lastName: true } } }
      },
      subject: { columns: { id: true, subjectName: true, subjectCode: true } }
    }
  });

/* One teacher per subject per section per year */
export const isSubjectTeacherAssigned = (tenantId, academicYearId, sectionId, subjectId) =>
  exists(
    db,
    teacherAssignments,
    scoped(
      teacherAssignments,
      tenantId,
      eq(teacherAssignments.academicYearId, academicYearId),
      eq(teacherAssignments.sectionId, sectionId),
      eq(teacherAssignments.subjectId, subjectId)
    )
  );

/* Soft remove */
export const removeTeacherAssignment = (tenantId, mapId) =>
  updateOne(db, teacherAssignments, scoped(teacherAssignments, tenantId, eq(teacherAssignments.id, mapId)), {
    isActive: false
  });
