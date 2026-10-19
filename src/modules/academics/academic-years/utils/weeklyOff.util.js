import { dayOfWeek } from "../../../../common/utils/date.util.js";

const SATURDAY = 6;

/* Whether `date` is a weekly off day of the year: one of its weekly off days, or one of
   its off Saturdays (offSaturdays [2] = the second Saturday of every month) */
export const isWeeklyOff = ({ weeklyOffDays = [], offSaturdays = [] }, date) => {
  const weekday = dayOfWeek(date);
  if (weeklyOffDays.includes(weekday)) return true;
  return weekday === SATURDAY && offSaturdays.includes(Math.ceil(Number(date.slice(8, 10)) / 7));
};
