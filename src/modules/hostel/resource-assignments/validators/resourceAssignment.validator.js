import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { BOOKING_PHASES } from "../../shared/constants/hostel.constants.js";

const params = idParams("assignmentId");

/* toDate before fromDate is refused when both are sent (otherwise by the service) */
const ordered = body => !body.fromDate || !body.toDate || body.toDate >= body.fromDate;
const orderedRule = [ordered, { message: "toDate cannot be before fromDate", path: ["toDate"] }];

export const resourceAssignmentValidators = {
  create: {
    body: z
      .object({
        resourceId: id(),
        studentId: id(),
        /* Ties the assignment to this bed allocation: it then ends with the bed */
        allocationId: id().optional(),
        /* Default: today (or the bed's start, when tied to an upcoming bed) */
        fromDate: date().optional(),
        /* Default: the bed's end when tied, otherwise open-ended. null = open-ended. */
        toDate: date().nullable().optional(),
        notes: optionalText(500)
      })
      .refine(...orderedRule)
  },
  list: {
    query: listQuery({
      resourceId: id().optional(),
      studentId: id().optional(),
      allocationId: id().optional(),
      hostelId: id().optional(),
      phase: z.enum(BOOKING_PHASES).optional(),
      activeOn: date().optional()
    })
  },
  getById: { params },
  update: {
    params,
    body: z
      .object({ fromDate: date(), toDate: date().nullable(), notes: z.string().trim().max(500) })
      .partial()
      .refine(body => Object.keys(body).length > 0, { message: "must include at least one field to update" })
      .refine(...orderedRule)
  },
  release: { params, body: z.object({ releasedOn: date().optional(), notes: optionalText(500) }) },
  cancel: { params, body: z.object({ reason: optionalText(500) }) }
};
