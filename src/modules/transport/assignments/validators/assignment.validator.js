import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { ASSIGNMENT_DIRECTIONS, ASSIGNMENT_STATUSES } from "../../shared/constants/transport.constants.js";

const params = idParams("assignmentId");

export const assignmentValidators = {
  create: {
    body: z.object({
      studentId: id(),
      routeId: id(),
      stopId: id(),
      direction: z.enum(ASSIGNMENT_DIRECTIONS).default("BOTH"),
      /* Defaults to today (inside the academic year) */
      startDate: date().optional(),
      notes: optionalText(500)
    })
  },
  list: {
    query: listQuery({
      routeId: id().optional(),
      stopId: id().optional(),
      studentId: id().optional(),
      status: z.enum(ASSIGNMENT_STATUSES).optional()
    })
  },
  getById: { params },
  /* endDate: the last day the student uses transport (default today) */
  end: { params, body: z.object({ endDate: date().optional() }) },
  change: {
    params,
    body: z.object({
      routeId: id(),
      stopId: id(),
      /* Keeps the current direction when omitted */
      direction: z.enum(ASSIGNMENT_DIRECTIONS).optional(),
      /* First day on the new route/stop (default today) */
      effectiveDate: date().optional()
    })
  }
};
