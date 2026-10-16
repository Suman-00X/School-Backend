import { addDays, dayOfWeek, daysBetween, eachDay } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { calendarService } from "../../../academics/calendar/index.js";

/* How far ahead a due date may be moved to find an open day */
const LOOKAHEAD_DAYS = 120;

/* Days in [from, to] when the library is closed. Inside an academic year that is
   the school calendar (weekly off days, holidays, vacations); between years only
   the current year's weekly off days close the library. */
const closedDaysBetween = async (ctx, from, to) => {
  const { rows: years } = await academicYearService.list(ctx, { page: 1, limit: 100 });
  const closed = new Set();
  for (const year of years.filter(y => y.startDate <= to && y.endDate >= from)) {
    const { closedDays } = await calendarService.workingDays(ctx, year, from, to);
    for (const { date } of closedDays) closed.add(date);
  }
  const weeklyOff = (years.find(y => y.isCurrent) ?? years[0])?.weeklyOffDays ?? [];
  for (const day of eachDay(from, to)) {
    const inYear = years.some(y => y.startDate <= day && y.endDate >= day);
    if (!inYear && weeklyOff.includes(dayOfWeek(day))) closed.add(day);
  }
  return closed;
};

/* The school calendar for a window of dates, loaded once and used synchronously */
export const loadLibraryCalendar = async (ctx, from, to) => {
  const closed = from <= to ? await closedDaysBetween(ctx, from, to) : new Set();
  const isOpen = day => !closed.has(day);
  return {
    isOpen,
    /* `day` itself when open, else the next open day (inside the window) */
    nextOpenDay: day => {
      for (let candidate = day; candidate <= to; candidate = addDays(candidate, 1)) {
        if (isOpen(candidate)) return candidate;
      }
      return day;
    },
    /* Days after dueDate up to and including onDate; closed days skipped when asked */
    lateDays: (dueDate, onDate, { skipClosed }) => {
      if (onDate <= dueDate) return 0;
      const days = daysBetween(dueDate, onDate);
      if (!skipClosed) return days;
      return days - [...closed].filter(day => day > dueDate && day <= onDate).length;
    }
  };
};

export const libraryCalendar = {
  load: loadLibraryCalendar,

  /* A due date that falls on a closed day moves to the next open day */
  nextOpenDay: async (ctx, date) =>
    (await loadLibraryCalendar(ctx, date, addDays(date, LOOKAHEAD_DAYS))).nextOpenDay(date),

  lateDays: async (ctx, dueDate, onDate, options) =>
    (await loadLibraryCalendar(ctx, addDays(dueDate, 1), onDate)).lateDays(dueDate, onDate, options)
};
