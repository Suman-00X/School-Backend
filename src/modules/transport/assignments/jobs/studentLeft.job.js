import { subscribe } from "../../../../common/events/events.js";
import { STUDENT_LEFT } from "../../../academics/enrollments/index.js";
import { assignmentService } from "../services/assignment.service.js";

/* A student who leaves the school gives up their seat (D-52): their active assignment
   in that year ends today (or on its start date, if that is later) */
subscribe(STUDENT_LEFT, "transport.releaseSeat", async ({ tenantId, studentId, academicYearId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  for (const assignment of await assignmentService.activeForStudent(ctx, studentId, academicYearId)) {
    await assignmentService.end(ctx, assignment.id, {});
  }
});
