import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { BOOKING_PHASES, MAX_ROOM_CAPACITY } from "../../shared/constants/hostel.constants.js";

/* Omit to take the lowest bed free for the whole stay. Whether it exists is checked against the room's capacity. */
const bedNumber = z.number().int().min(1).max(MAX_ROOM_CAPACITY).optional();

const params = idParams("allocationId");

/* toDate before fromDate is refused when both are sent (otherwise by the service) */
const ordered = [
  body => !body.fromDate || !body.toDate || body.toDate >= body.fromDate,
  { message: "toDate cannot be before fromDate", path: ["toDate"] }
];

export const allocationValidators = {
  create: {
    body: z
      .object({
        studentId: id(),
        roomId: id(),
        bedNumber,
        /* Defaults to today; a later date books ahead */
        fromDate: date().optional(),
        /* Omit (or null) for an open-ended stay */
        toDate: date().nullable().optional(),
        notes: optionalText(500)
      })
      .refine(...ordered)
  },
  list: {
    query: listQuery({
      hostelId: id().optional(),
      roomId: id().optional(),
      studentId: id().optional(),
      /* As of today */
      phase: z.enum(BOOKING_PHASES).optional(),
      /* Active on this day */
      activeOn: date().optional(),
      /* Active on any day of [fromDate, toDate] (toDate omitted: from fromDate on) */
      fromDate: date().optional(),
      toDate: date().optional()
    })
      .refine(query => !query.toDate || query.fromDate, { message: "needs fromDate", path: ["toDate"] })
      .refine(...ordered)
  },
  getById: { params },
  /* Extend or shorten (toDate; null = open-ended), move the start of a booking that has not begun, or edit notes */
  update: {
    params,
    body: z
      .object({ fromDate: date(), toDate: date().nullable(), notes: z.string().trim().max(500) })
      .partial()
      .refine(body => Object.keys(body).length > 0, { message: "must include at least one field to update" })
      .refine(...ordered)
  },
  vacate: { params, body: z.object({ vacatedOn: date().optional(), notes: optionalText(500) }) },
  cancel: { params, body: z.object({ reason: optionalText(500) }) },
  transfer: {
    params,
    body: z.object({
      roomId: id(),
      bedNumber,
      /* First night in the new bed; the old allocation ends the day before. Default: today. */
      fromDate: date().optional(),
      notes: optionalText(500)
    })
  },
  availability: {
    query: z
      .object({
        fromDate: date(),
        /* Omit for "from fromDate on, with no end" */
        toDate: date().optional(),
        hostelId: id().optional(),
        roomType: z.string().trim().min(1).max(50).optional()
      })
      .refine(...ordered)
  },
  rollover: {
    body: z.object({
      /* The year residents continue into; they come from the current year (or X-Academic-Year-Id) */
      toAcademicYearId: id(),
      /* Also continue their resources (lockers, plans) that run to the year's end */
      includeResources: z.boolean().default(false),
      /* Report what would happen without changing anything */
      dryRun: z.boolean().default(false)
    })
  }
};
