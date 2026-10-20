import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { CALENDAR_EVENT_CATEGORIES, CALENDAR_EVENT_TYPES } from "../../shared/constants/academic.constants.js";

const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "must be a time like 09:30");

const CATEGORIES = [...new Set(Object.values(CALENDAR_EVENT_CATEGORIES).flat())];

/* EXAM events: when and where each paper of the exam is sat. Every paper of the exam is
   listed; the event's dates are the first and last paper's. */
const timetableRow = z.object({
  paperId: id(),
  examDate: date(),
  startTime: time(),
  endTime: time(),
  room: z.string().trim().min(1).max(30).optional()
});

/* The rules that need the type (category of the type, an exam's timetable…) are checked by
   the service against the stored event too, so they hold for a PATCH of one field */
const fields = z.object({
  /* EXAM: optional, the exam's name is used */
  title: text(150).optional(),
  eventType: z.enum(CALENDAR_EVENT_TYPES),
  category: z.enum(CATEGORIES).optional(),
  examId: id().optional(),
  timetable: z.array(timetableRow).min(1).max(1000).optional(),
  /* EXAM: not sent, they come from the timetable */
  startDate: date().optional(),
  /* Defaults to startDate (single-day event) */
  endDate: date().optional(),
  /* Holidays and vacations always close the school; exams and meetings never do */
  isHoliday: z.boolean().optional(),
  startTime: time().optional(),
  endTime: time().optional(),
  venue: z.string().trim().min(1).max(100).optional(),
  /* Events and parent meetings: the classes taking part; empty for the whole school */
  classIds: z.array(id()).max(100).optional(),
  description: optionalText()
});

const dateWindow = (from, to) => !from || !to || to >= from;

const params = idParams("eventId");

const timesInOrder = [e => !e.startTime || !e.endTime || e.endTime > e.startTime, { path: ["endTime"], message: "must be after startTime" }];

export const calendarValidators = {
  create: {
    body: fields
      .refine(e => !e.endDate || !e.startDate || e.endDate >= e.startDate, {
        path: ["endDate"],
        message: "must be on or after startDate"
      })
      .refine(...timesInOrder)
  },
  list: {
    query: listQuery({
      from: date().optional(),
      to: date().optional(),
      eventType: z.enum(CALENDAR_EVENT_TYPES).optional()
    }).refine(q => dateWindow(q.from, q.to), { path: ["to"], message: "must be on or after from" })
  },
  getById: { params },
  /* The type and the exam are fixed once the event exists; null clears the times, "" the venue, [] the classes */
  update: {
    params,
    body: patchBody(
      fields.omit({ eventType: true, examId: true }).extend({
        startTime: time().nullable().optional(),
        endTime: time().nullable().optional(),
        venue: z.string().trim().max(100).optional()
      })
    ).refine(...timesInOrder)
  },
  remove: { params },
  workingDays: {
    query: z
      .object({ from: date(), to: date() })
      .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" })
  }
};
