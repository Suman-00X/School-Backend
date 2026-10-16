import { subscribe } from "../../../../common/events/events.js";
import { STUDENT_LEFT } from "../../../academics/enrollments/index.js";
import { studentService } from "../../../users/students/index.js";
import { holdService } from "../services/hold.service.js";

/* A student who leaves the school no longer waits for books: their open holds are
   cancelled and any copy kept for them goes to the next reader. Loans stay open
   until the books come back. */
subscribe(STUDENT_LEFT, "library.cancelHolds", async ({ tenantId, studentId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const [student] = await studentService.findManyByIds(ctx, [studentId]);
  if (student) await holdService.cancelAllFor(ctx, student.userId, "The student left the school");
});
