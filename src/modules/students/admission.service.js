import { db } from "../../database/postgres/client.js";
import * as userQueries from "../users/user.queries.js";
import * as studentQueries from "./student.queries.js";
import * as studentParentQueries from "./studentParent.queries.js";
import * as enrollmentQueries from "../enrollments/enrollment.queries.js";
import * as parentService from "../parents/parent.service.js";
import { getSectionContext } from "../sections/section.service.js";
import {
  generateStudentId,
  generateStudentRollNumber
} from "../../common/services/idFormat.service.js";

/* New admission: student user + profile, parents and their links, and the
   enrollment in the given section, all in one transaction */
export const admitStudent = async (tenantId, { student, parents = [], admission }) => {
  /* Validate academic year + section, and derive codes from them */
  const { academicYear, section, yearYY, classSequence } = await getSectionContext(
    tenantId,
    admission.academicYearId,
    admission.sectionId
  );

  return db.transaction(async tx => {
    const studentUser = await userQueries.createUser(
      tenantId,
      { ...student.user, role: "STUDENT" },
      tx
    );

    const studentCode = await generateStudentId({
      tenantId,
      admissionYearYY: yearYY,
      classSequence,
      dbc: tx
    });

    const studentRecord = await studentQueries.createStudent(
      tenantId,
      { ...student.profile, userId: studentUser.id, studentCode },
      tx
    );

    for (const parent of parents) {
      const parentRecord = await parentService.createParentWithUser(
        tenantId,
        { user: parent.user, profile: parent.profile },
        { yearYY, dbc: tx }
      );

      await studentParentQueries.mapStudentParent(
        tenantId,
        {
          studentId: studentRecord.id,
          parentId: parentRecord.id,
          relation: parent.relation,
          isPrimaryContact: parent.isPrimaryContact
        },
        tx
      );
    }

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
        studentId: studentRecord.id,
        academicYearId: academicYear.id,
        sectionId: section.id,
        rollNumber,
        admissionType: admission.admissionType ?? "NEW",
        status: "ACTIVE"
      },
      tx
    );

    return { student: studentRecord, admission: enrollment };
  });
};
