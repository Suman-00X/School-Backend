import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import {
  STUDENT_LEAVE_REASON_KEYS,
  STUDENT_LEAVE_SESSIONS,
  STUDENT_LEAVE_STATUSES
} from "../constants/studentLeave.constants.js";

/* Filters shared by the staff list and the portal */
export const leaveFilters = {
  status: z.enum(STUDENT_LEAVE_STATUSES).optional(),
  from: date().optional(),
  to: date().optional()
};

/* What a parent sends to apply (the portal route names the student) */
export const leaveApplication = z
  .object({
    fromDate: date(),
    /* Default: fromDate (one day) */
    toDate: date().optional(),
    /* FORENOON / AFTERNOON: half of one day */
    session: z.enum(STUDENT_LEAVE_SESSIONS).default("FULL_DAY"),
    reasonCategory: z.enum(STUDENT_LEAVE_REASON_KEYS),
    reason: text(1000)
  })
  .transform(body => ({ ...body, toDate: body.toDate ?? body.fromDate }))
  .refine(body => body.toDate >= body.fromDate, { path: ["toDate"], message: "must be on or after fromDate" })
  .refine(body => body.session === "FULL_DAY" || body.toDate === body.fromDate, {
    path: ["session"],
    message: "a half day is for one date: toDate must equal fromDate"
  });

export const leaveCancellation = z.object({ reason: optionalText(500) });

const params = idParams("requestId");

export const studentLeaveValidators = {
  list: {
    query: listQuery({ studentId: id().optional(), sectionId: id().optional(), ...leaveFilters })
  },
  onLeave: { query: z.object({ sectionId: id(), date: date() }) },
  getById: { params },
  decide: {
    params,
    body: z
      .object({ decision: z.enum(["APPROVED", "REJECTED"]), note: optionalText(500) })
      .refine(body => body.decision === "APPROVED" || body.note, {
        path: ["note"],
        message: "is required when rejecting, so the family knows why"
      })
  }
};
