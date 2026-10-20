import { and, eq, inArray } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { holisticProgressRecords } from "../models/holisticProgress.schema.js";

const base = createRepository({ table: holisticProgressRecords, queryKey: "holisticProgressRecords" });

export const holisticProgressRepository = {
  ...base,

  findFor: (tenantId, examId, studentId) =>
    base.findOne(tenantId, [eq(holisticProgressRecords.examId, examId), eq(holisticProgressRecords.studentId, studentId)]),

  findForStudents: (tenantId, examId, studentIds) =>
    studentIds.length
      ? base.findMany(tenantId, {
          conditions: [
            eq(holisticProgressRecords.examId, examId),
            inArray(holisticProgressRecords.studentId, studentIds)
          ]
        })
      : [],

  /* Part A of the card: who the student is, with the national ids */
  studentDetails: async (tenantId, studentId) => {
    const [row] = await db
      .select({
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName,
        gender: users.gender,
        dob: users.dob,
        admissionNumber: students.admissionNumber,
        pen: students.pen,
        apaarId: students.apaarId,
        motherTongue: students.motherTongue
      })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(eq(students.tenantId, tenantId), eq(students.id, studentId), eq(students.isActive, true)));
    return row ?? null;
  }
};
