import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { studentEnrollments } from "../../database/postgres/schema/index.js";
import { exists, findOne, scoped, updateOne } from "../../database/postgres/helpers.js";

export const createEnrollment = async (tenantId, payload, dbc = db) => {
  const [row] = await dbc
    .insert(studentEnrollments)
    .values({ ...payload, tenantId })
    .returning();
  return row;
};

export const getStudentsBySection = (tenantId, academicYearId, sectionId) =>
  db.query.studentEnrollments.findMany({
    where: scoped(
      studentEnrollments,
      tenantId,
      eq(studentEnrollments.academicYearId, academicYearId),
      eq(studentEnrollments.sectionId, sectionId)
    ),
    with: {
      student: {
        columns: { id: true, studentCode: true, admissionNumber: true },
        with: { user: { columns: { firstName: true, lastName: true } } }
      }
    },
    orderBy: studentEnrollments.rollNumber
  });

export const updateEnrollment = (tenantId, academicYearId, mapId, values) =>
  updateOne(
    db,
    studentEnrollments,
    scoped(studentEnrollments, tenantId, eq(studentEnrollments.academicYearId, academicYearId), eq(studentEnrollments.id, mapId)),
    values
  );

export const getActiveEnrollment = (tenantId, studentId, academicYearId) =>
  findOne(
    db,
    studentEnrollments,
    scoped(
      studentEnrollments,
      tenantId,
      eq(studentEnrollments.studentId, studentId),
      eq(studentEnrollments.academicYearId, academicYearId),
      eq(studentEnrollments.status, "ACTIVE")
    )
  );

export const closeEnrollment = (tenantId, enrollmentId, dbc = db) =>
  updateOne(
    dbc,
    studentEnrollments,
    scoped(studentEnrollments, tenantId, eq(studentEnrollments.id, enrollmentId)),
    { status: "LEFT" }
  );

export const isStudentEnrolled = (tenantId, academicYearId, studentId) =>
  exists(
    db,
    studentEnrollments,
    scoped(studentEnrollments, tenantId, eq(studentEnrollments.academicYearId, academicYearId), eq(studentEnrollments.studentId, studentId))
  );

export const isRollNumberTaken = (tenantId, sectionId, rollNumber) =>
  exists(
    db,
    studentEnrollments,
    scoped(studentEnrollments, tenantId, eq(studentEnrollments.sectionId, sectionId), eq(studentEnrollments.rollNumber, rollNumber))
  );

export const isStudentInSection = (tenantId, studentId, sectionId, academicYearId) =>
  exists(
    db,
    studentEnrollments,
    scoped(
      studentEnrollments,
      tenantId,
      eq(studentEnrollments.studentId, studentId),
      eq(studentEnrollments.sectionId, sectionId),
      eq(studentEnrollments.academicYearId, academicYearId)
    )
  );
