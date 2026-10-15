import { and, eq, gte, lte } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { dayOfWeek, eachDay, maxDate, minDate } from "../../../../common/utils/date.util.js";
import { NON_WORKING_EVENT_TYPES } from "../../shared/constants/academic.constants.js";
import { calendarEvents } from "../models/calendarEvent.schema.js";
import { calendarEventRepository } from "../repositories/calendarEvent.repository.js";

const base = createCrudService(calendarEventRepository, { entity: "Calendar event" });

/* Events overlapping [from, to] */
const overlapping = (from, to) => and(lte(calendarEvents.startDate, to), gte(calendarEvents.endDate, from));

const assertInYear = (academicYear, { startDate, endDate }) => {
  if (startDate < academicYear.startDate || endDate > academicYear.endDate) {
    throw unprocessable(
      `Event dates must fall within the academic year (${academicYear.startDate} to ${academicYear.endDate})`
    );
  }
};

const withHolidayFlag = data =>
  data.eventType ? { ...data, isHoliday: data.isHoliday ?? NON_WORKING_EVENT_TYPES.includes(data.eventType) } : data;

export const calendarService = {
  getById: base.getById,
  remove: base.remove,

  /* Year-scoped; optional date window and type */
  list: (ctx, { page, limit, from, to, eventType }) =>
    base.list(
      ctx,
      { page, limit },
      [
        eq(calendarEvents.academicYearId, ctx.academicYearId),
        (from || to) && overlapping(from ?? "0001-01-01", to ?? "9999-12-31"),
        eventType && eq(calendarEvents.eventType, eventType)
      ].filter(Boolean)
    ),

  create: (ctx, data) => {
    assertInYear(ctx.academicYear, { ...data, endDate: data.endDate ?? data.startDate });
    return calendarEventRepository.create(ctx.tenantId, {
      ...withHolidayFlag(data),
      endDate: data.endDate ?? data.startDate,
      academicYearId: ctx.academicYearId
    });
  },

  update: async (ctx, eventId, data) => {
    const existing = await calendarEventRepository.findById(ctx.tenantId, eventId);
    if (!existing) throw notFound("Calendar event");
    const merged = { ...existing, ...data };
    if (merged.endDate < merged.startDate) throw unprocessable("endDate must be on or after startDate");
    return base.update(ctx, eventId, withHolidayFlag(data));
  },

  /* For other submodules.
     Every school day in [from, to] (clamped to the academic year): not a weekly
     off day and not covered by a holiday/vacation event. */
  workingDays: async (ctx, academicYear, from, to) => {
    const start = maxDate(from, academicYear.startDate);
    const end = minDate(to, academicYear.endDate);
    if (start > end) return { from: start, to: end, workingDays: [], closedDays: [] };

    const closures = await calendarEventRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(calendarEvents.academicYearId, academicYear.id),
        eq(calendarEvents.isHoliday, true),
        overlapping(start, end)
      ]
    });

    const workingDays = [];
    const closedDays = [];
    for (const day of eachDay(start, end)) {
      const closure = closures.find(event => event.startDate <= day && event.endDate >= day);
      if (academicYear.weeklyOffDays.includes(dayOfWeek(day))) closedDays.push({ date: day, reason: "WEEKLY_OFF" });
      else if (closure) closedDays.push({ date: day, reason: closure.eventType, title: closure.title });
      else workingDays.push(day);
    }
    return { from: start, to: end, workingDays, closedDays };
  },

  /* Why the school is closed on `date`, or null when it is a working day */
  closureOn: async (ctx, academicYear, date) => {
    if (date < academicYear.startDate || date > academicYear.endDate) return "OUTSIDE_ACADEMIC_YEAR";
    const { closedDays } = await calendarService.workingDays(ctx, academicYear, date, date);
    return closedDays[0]?.reason ?? null;
  }
};
