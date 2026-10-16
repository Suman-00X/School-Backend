import { subscribe } from "../../../../common/events/events.js";
import { STUDENT_LEFT } from "../../../academics/enrollments/index.js";
import { leaverService } from "../services/leaver.service.js";

/* A student who leaves the school gives up their bed and hostel resources from today:
   current ones end, upcoming ones are cancelled, and hostel managers are notified in-app */
subscribe(STUDENT_LEFT, "hostel.releaseBed", async ({ tenantId, studentId }) => {
  await leaverService.release({ tenantId, role: "SYSTEM" }, studentId);
});
