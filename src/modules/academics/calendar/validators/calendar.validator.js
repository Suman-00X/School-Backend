import { z } from "../../../../common/validation/zod.js";
import { date, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { CALENDAR_EVENT_TYPES } from "../../shared/constants/academic.constants.js";

const fields = z.object({
  title: text(150),
  eventType: z.enum(CALENDAR_EVENT_TYPES),
  startDate: date(),
  /* Defaults to startDate (single-day event) */
  endDate: date().optional(),
  /* Defaults to true for HOLIDAY and VACATION */
  isHoliday: z.boolean().optional(),
  description: optionalText()
});

const dateWindow = (from, to) => !from || !to || to >= from;

const params = idParams("eventId");

export const calendarValidators = {
  create: {
    body: fields.refine(e => !e.endDate || e.endDate >= e.startDate, {
      path: ["endDate"],
      message: "must be on or after startDate"
    })
  },
  list: {
    query: listQuery({
      from: date().optional(),
      to: date().optional(),
      eventType: z.enum(CALENDAR_EVENT_TYPES).optional()
    }).refine(q => dateWindow(q.from, q.to), { path: ["to"], message: "must be on or after from" })
  },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params },
  workingDays: {
    query: z
      .object({ from: date(), to: date() })
      .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" })
  }
};
