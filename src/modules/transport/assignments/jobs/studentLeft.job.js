import { subscribe } from "../../../../common/events/events.js";
import { enrollmentService, STUDENT_LEFT } from "../../../academics/enrollments/index.js";
import { assignmentService } from "../services/assignment.service.js";

/* A student who leaves the school gives up their seat (D-52): their active assignment
   in that year ends today (or on its start date, if that is later). So does one in another
   year they are no longer active in: a TC after promotion closes next year's enrollment
   while this year's bus still runs. */
subscribe(STUDENT_LEFT, "transport.releaseSeat", async ({ tenantId, studentId, academicYearId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const enrollments = await enrollmentService.findAllForStudent(ctx, studentId);
  const stillIn = new Set(enrollments.filter(e => e.status === "ACTIVE").map(e => e.academicYearId));
  const years = new Set([academicYearId, ...enrollments.map(e => e.academicYearId).filter(id => !stillIn.has(id))]);
  for (const yearId of years) {
    for (const assignment of await assignmentService.activeForStudent(ctx, studentId, yearId)) {
      await assignmentService.end(ctx, assignment.id, {});
    }
  }
});
