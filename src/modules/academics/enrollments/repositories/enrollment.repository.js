import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { studentEnrollments } from "../models/enrollment.schema.js";

const base = createRepository({
  table: studentEnrollments,
  queryKey: "studentEnrollments",
  orderBy: asc(studentEnrollments.rollNumber)
});

export const enrollmentRepository = {
  ...base,

  /* Every row of some sections that holds a roll number (LEFT and removed rows too: the
     numbers are unique per section across all of them), with the names roll numbers are
     ordered by. `forUpdate` locks the rows for a renumbering. */
  findNumbered: (tenantId, sectionIds, { dbc, forUpdate = false }) => {
    const query = dbc
      .select({
        id: studentEnrollments.id,
        sectionId: studentEnrollments.sectionId,
        studentId: studentEnrollments.studentId,
        rollNumber: studentEnrollments.rollNumber,
        status: studentEnrollments.status,
        isActive: studentEnrollments.isActive,
        admissionNumber: students.admissionNumber,
        studentCode: students.studentCode,
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName
      })
      .from(studentEnrollments)
      .innerJoin(students, eq(students.id, studentEnrollments.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(eq(studentEnrollments.tenantId, tenantId), inArray(studentEnrollments.sectionId, sectionIds)))
      .orderBy(asc(studentEnrollments.rollNumber));
    return forUpdate ? query.for("update", { of: studentEnrollments }) : query;
  },

  /* Give rows new roll numbers ([{ id, rollNumber }]). Two steps, so that numbers can swap
     between rows without meeting the (section, roll number) unique index half-way. */
  setRollNumbers: async (tenantId, changes, { dbc }) => {
    if (!changes.length) return;
    const ids = changes.map(change => change.id);
    await dbc
      .update(studentEnrollments)
      .set({ rollNumber: sql`'~' || ${studentEnrollments.id}::text`, updatedAt: new Date() })
      .where(and(eq(studentEnrollments.tenantId, tenantId), inArray(studentEnrollments.id, ids)));
    const values = sql.join(
      changes.map(change => sql`(${change.id}::uuid, ${change.rollNumber}::text)`),
      sql`, `
    );
    await dbc.execute(sql`
      UPDATE student_enrollments AS e SET roll_number = v.roll_number
      FROM (VALUES ${values}) AS v(id, roll_number)
      WHERE e.id = v.id AND e.tenant_id = ${tenantId}`);
  }
};
