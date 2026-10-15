import { z } from "../../../../common/validation/zod.js";
import { date, id, optionalText } from "../../../../common/validation/schemas.js";
import { STAFF_ATTENDANCE_STATUSES, TIMED_ATTENDANCE_STATUSES } from "../../shared/constants/hr.constants.js";
import { clockTime, dateRange } from "../../shared/utils/validators.util.js";

const record = z
  .object({
    userId: id(),
    status: z.enum(STAFF_ATTENDANCE_STATUSES),
    checkIn: clockTime().optional(),
    checkOut: clockTime().optional(),
    remarks: optionalText(300)
  })
  .refine(r => TIMED_ATTENDANCE_STATUSES.includes(r.status) || (!r.checkIn && !r.checkOut), {
    path: ["checkIn"],
    message: `can only be given for ${TIMED_ATTENDANCE_STATUSES.join(", ")}`
  })
  .refine(r => !r.checkIn || !r.checkOut || r.checkOut >= r.checkIn, {
    path: ["checkOut"],
    message: "must not be before checkIn"
  });

export const staffAttendanceValidators = {
  record: {
    body: z.object({
      date: date(),
      records: z
        .array(record)
        .min(1)
        .max(500)
        .refine(list => new Set(list.map(r => r.userId)).size === list.length, "must not list the same employee twice")
    })
  },
  register: { query: z.object({ date: date() }) },
  summary: { query: dateRange().and(z.object({ userId: id().optional() })) },
  mine: { query: dateRange() }
};
