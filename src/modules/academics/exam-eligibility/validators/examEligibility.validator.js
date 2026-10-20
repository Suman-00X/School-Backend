import { z } from "../../../../common/validation/zod.js";
import { id, idParams, patchBody, text } from "../../../../common/validation/schemas.js";

export const examEligibilityValidators = {
  updatePolicy: {
    body: patchBody(
      z.object({
        attendanceRuleEnabled: z.boolean(),
        /* % of the year's attendance up to the day before the exam */
        minAttendancePercentage: z.number().int().min(1).max(100),
        duesRuleEnabled: z.boolean(),
        /* Overdue fees a student may still owe and sit the exam (0: everything due is paid) */
        maxOverdueAmount: z.number().min(0).max(100_000_000).multipleOf(0.01)
      })
    )
  },
  evaluate: { params: idParams("examId"), query: z.object({ sectionId: id().optional() }) },
  exempt: { params: idParams("examId"), body: z.object({ studentId: id(), reason: text(500) }) },
  removeExemption: { params: idParams("examId", "studentId") }
};
