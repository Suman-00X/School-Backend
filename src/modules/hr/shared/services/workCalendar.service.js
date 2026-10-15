import { gte, lte } from "drizzle-orm";
import { eachDay } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { calendarService } from "../../../academics/calendar/index.js";

/* The school calendar as it applies to employees. Days inside an academic year
   follow its weekly offs and holidays; days outside every academic year
   (e.g. the summer gap between years) count as ordinary days. */

export const CLOSURE_LABELS = {
  WEEKLY_OFF: "a weekly off day",
  HOLIDAY: "a holiday",
  VACATION: "a vacation day"
};

const yearsOverlapping = async (ctx, from, to) =>
  (
    await academicYearService.list(ctx, { page: 1, limit: 100 }, [
      lte(academicYears.startDate, to),
      gte(academicYears.endDate, from)
    ])
  ).rows;

export const workCalendar = {
  /* Why the school is closed on `date` (WEEKLY_OFF, HOLIDAY…), or null */
  closureOn: async (ctx, date) => {
    const [year] = await yearsOverlapping(ctx, date, date);
    return year ? calendarService.closureOn(ctx, year, date) : null;
  },

  /* Working days in [from, to] -> { days, uncoveredDays } (uncoveredDays: days
     outside every academic year, counted as calendar days) */
  workingDays: async (ctx, from, to) => {
    const working = new Set();
    const covered = new Set();
    for (const year of await yearsOverlapping(ctx, from, to)) {
      const result = await calendarService.workingDays(ctx, year, from, to);
      for (const day of result.workingDays) working.add(day);
      if (result.from <= result.to) for (const day of eachDay(result.from, result.to)) covered.add(day);
    }
    const all = eachDay(from, to);
    return {
      days: all.filter(day => working.has(day) || !covered.has(day)),
      uncoveredDays: all.filter(day => !covered.has(day)).length
    };
  }
};
