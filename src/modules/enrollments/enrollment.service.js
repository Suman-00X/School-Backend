import { db } from "../../database/postgres/client.js";
import * as enrollmentQueries from "./enrollment.queries.js";
import { getSectionContext } from "../sections/section.service.js";
import { generateStudentRollNumber } from "../../common/services/idFormat.service.js";
import { badRequest, conflict } from "../../common/utils/appError.util.js";

/* Move a student from their section in one academic year to a section in another */
export const promoteStudent = async (
  tenantId,
  { studentId, fromAcademicYearId, toAcademicYearId, toSectionId, admissionType = "PROMOTED" }
) => {
  if (!studentId || !fromAcademicYearId || !toAcademicYearId || !toSectionId) {
    throw badRequest("studentId, fromAcademicYearId, toAcademicYearId and toSectionId are required");
  }
  if (String(fromAcademicYearId) === String(toAcademicYearId)) {
    throw badRequest("Target academic year must differ from the current one");
  }

  /* 1. section must belong to the new academic year */
  const { section, yearYY, classSequence } = await getSectionContext(tenantId, toAcademicYearId, toSectionId);

  /* 2. prevent double promotion */
  if (await enrollmentQueries.isStudentEnrolled(tenantId, toAcademicYearId, studentId)) {
    throw conflict("Student already promoted");
  }

  /* 3. student must be active in the previous academic year */
  const previous = await enrollmentQueries.getActiveEnrollment(tenantId, studentId, fromAcademicYearId);
  if (!previous) throw badRequest("Student not found in previous academic year");

  return db.transaction(async tx => {
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: yearYY,
      classSequence,
      sectionName: section.sectionName,
      dbc: tx
    });

    const enrollment = await enrollmentQueries.createEnrollment(
      tenantId,
      {
        studentId,
        academicYearId: toAcademicYearId,
        sectionId: toSectionId,
        rollNumber,
        admissionType,
        status: "ACTIVE"
      },
      tx
    );

    await enrollmentQueries.closeEnrollment(tenantId, previous.id, tx);

    return enrollment;
  });
};
