import { unprocessable } from "../../../../common/http/errors.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { studentService } from "../../../users/students/index.js";
import { fullName } from "../utils/hostel.util.js";

/* Students as the hostel rules see them (allocations and resource assignments) */
export const residents = {
  /* The student behind a request, with the account fields the rules need (gender) */
  load: async (ctx, studentId) => {
    const [student] = await studentService.findManyByIds(ctx, [studentId]);
    if (!student) throw unprocessable("studentId does not refer to an existing student");
    const [account] = await accountService.findManyByIds(ctx, [student.userId]);
    return { ...student, account: account ?? student.user, name: fullName(student.user) };
  },

  /* Ids of the academic years in which the student is actively enrolled */
  activeYearIds: async (ctx, studentId) =>
    (await enrollmentService.findAllForStudent(ctx, studentId))
      .filter(enrollment => enrollment.status === "ACTIVE")
      .map(enrollment => enrollment.academicYearId),

  /* New bookings need a current student: actively enrolled in some year (this one, or next
     year's admission). Leavers have no ACTIVE enrollment left. */
  assertCurrent: async (ctx, student) => {
    if (!(await residents.activeYearIds(ctx, student.id)).length) {
      throw unprocessable(`${student.name} is not actively enrolled in any academic year`);
    }
  }
};
